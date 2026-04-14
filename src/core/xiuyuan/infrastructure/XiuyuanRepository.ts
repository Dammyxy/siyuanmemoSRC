/**
 * XiuyuanRepository - 淇紭浠撳偍瀹炵幇
 * 
 * @description
 * 瀹炵幇 IXiuyuanRepository 鎺ュ彛锛屽崗璋?msgpack銆佸潡灞炴€с€丷iff 涓変釜鏁版嵁婧愩€?
 * 
 * **鑱岃矗**锛?
 * - 棰嗗煙妯″瀷涓庢寔涔呭寲妯″瀷鐨勮浆鎹?
 * - 鍗忚皟澶氫釜鏁版嵁婧愶紙msgpack, block attributes, Riff锛?
 * - 鍙戝竷棰嗗煙浜嬩欢
 * - 缁熶竴閿欒澶勭悊
 * 
 * **鏁版嵁婧愬崗璋?*锛?
 * ```
 * save(xiuyuan)
 *   鈹溾攢> msgpack: 淇濆瓨 Xiuyuan 鏁版嵁
 *   鈹溾攢> block attributes: 鍐欏叆鍧楀睘鎬?
 *   鈹溾攢> Riff: 鍚屾鍗＄墖
 *   鈹斺攢> events: 鍙戝竷棰嗗煙浜嬩欢
 * 
 * delete(xiuyuan)
 *   鈹溾攢> msgpack: 鍒犻櫎 Xiuyuan 鏁版嵁
 *   鈹溾攢> block attributes: 娓呴櫎鍧楀睘鎬?
 *   鈹溾攢> Riff: 鍒犻櫎鍗＄墖
 *   鈹斺攢> events: 鍙戝竷棰嗗煙浜嬩欢
 * ```
 */

import { ok, err, isErr, type Result } from '../../../types/result';
import { IXiuyuanRepository } from '../domain/repositories/IXiuyuanRepository';
import { Xiuyuan, XiuyuanProps } from '../domain/Xiuyuan';
import { XiuyuanId } from '../domain/XiuyuanId';
import { BlockId } from '../domain/BlockId';
import { TemplateId } from '../domain/TemplateId';
import { CardFace } from '../domain/CardFace';
import { Priority } from '../domain/Priority';
import { Card } from '../domain/Card';
import { CardId } from '../domain/CardId';
import { ScheduleInfo } from '../domain/ScheduleInfo';
import { IXiuyuan } from '../types';
import { CardState, CardType } from '../../../types/card';
import type { FSRSCard } from '../../../types/card';
import { UnifiedStorageManager } from '../../storage/UnifiedStorageManager';
import { setBlockAttrs } from '../../siyuan/api';
import { ATTR_CARD_TYPE } from '../../siyuan/block';
import { TemplateRegistry } from '../templates/TemplateRegistry';
import { createLogger } from '@/utils/logger';
import type { CardPersistenceDTO } from '../../../infrastructure/persistence/dto/CardPersistenceDTO';

const logger = createLogger('XiuyuanRepository');
const CARD_ID_DEBUG_SAMPLE_LIMIT = 5;

type XiuyuanCardType = 'item' | 'topic' | 'concept' | 'descriptor' | 'cloze';
type SchedulerType = 'fsrs-v6' | 'a-factor' | 'sm2';
type CardIdResolutionStats = {
  sourceCardIds: string[];
  resolvedCardIds: string[];
  missingDtoCardIds: string[];
};
type XiuyuanReadCardRepairCandidate = {
  xiuyuanId: string;
  removedCount: number;
  persisted: IXiuyuan;
};

type ListTemplateChild = {
  id: string;
  cue: string;
  answer: string;
  index: number;
};

type FaceSnapshot = {
  question: string;
  answer: string;
  questionBlockId?: string;
  answerBlockId?: string;
};

type XiuyuanMeta = Record<string, unknown> & {
  cardType?: XiuyuanCardType;
  schedulerType?: SchedulerType;
  aFactor?: number;
  extractedFrom?: string;
  isDocument?: boolean;
  progressive?: Record<string, unknown>;
  source?: string;
  symbolDetected?: boolean;
  cardSource?: string;
  symbolType?: string;
  clozeRenderMode?: string;
  forceQuickRender?: boolean;
  quickDetectReason?: string;
  fieldMapping?: Record<string, unknown>;
  listTemplate?: {
    mode?: 'split-v2' | 'summary-v1';
    groupId?: string;
    parentBlockId?: string;
    parentParagraphId?: string;
    currentIndex?: number;
    childrenData?: ListTemplateChild[];
  };
};

type CardTypeDetectionPort = {
  detectCardType: (blockId: string) => Promise<XiuyuanCardType>;
};

function isListTemplateChild(value: unknown): value is ListTemplateChild {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<ListTemplateChild>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.cue === 'string' &&
    typeof candidate.answer === 'string' &&
    Number.isFinite(Number(candidate.index))
  );
}

function isFaceSnapshot(value: unknown): value is FaceSnapshot {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<FaceSnapshot>;
  return typeof candidate.question === 'string' && typeof candidate.answer === 'string';
}

function normalizeFieldMapping(value: unknown): Record<string, string> | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const entries = Object.entries(value)
    .filter(([, fieldValue]) => typeof fieldValue === 'string')
    .map(([key, fieldValue]) => [key, fieldValue as string] as const);

  if (entries.length === 0) {
    return undefined;
  }

  return Object.fromEntries(entries);
}

function readFiniteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

const IMAGE_OCCLUSION_META_KEYS = [
  'source',
  'imageOcclusion',
  'imageOcclusionMaskId',
  'imageOcclusionMaskIndex',
  'imageOcclusionMaskGroupId',
  'imageOcclusionMaskCount',
  'imageOcclusionPayloadVersion',
  'imageOcclusionImageSrc',
  'imageOcclusionPrompt',
  'content',
  'title',
] as const;

function pickImageOcclusionMeta(meta: XiuyuanMeta): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const key of IMAGE_OCCLUSION_META_KEYS) {
    const value = meta[key];
    if (value !== undefined) {
      result[key] = value;
    }
  }
  return result;
}

/**
 * XiuyuanRepository 瀹炵幇
 * 
 * @class XiuyuanRepository
 * @implements {IXiuyuanRepository}
 */
export class XiuyuanRepository implements IXiuyuanRepository {
  private templateRegistry: TemplateRegistry;
  // 馃殌 鎬ц兘浼樺寲锛氬崱鐗嘔D鍒癤iuyuanID鐨勭储寮曟槧灏?
  private cardToXiuyuanIndex: Map<string, string> = new Map();

  constructor(
    private readonly storage: UnifiedStorageManager,
    private readonly cardTypeDetectionService?: CardTypeDetectionPort
  ) {
    this.templateRegistry = new TemplateRegistry();
  }

  /**
   * 馃殌 蹇€熸煡鎵撅細閫氳繃鍗＄墖ID鑾峰彇XiuyuanID
   * 鏃堕棿澶嶆潅搴︼細O(1)
   */
  getXiuyuanIdByCardId(cardId: string): string | undefined {
    return this.cardToXiuyuanIndex.get(cardId);
  }

  private isManagedRiffXiuyuan(xiuyuan: Xiuyuan): boolean {
    if (xiuyuan.getTemplateID().getValue() === 'builtin-riff-sync') {
      return true;
    }

    return xiuyuan.getMeta().source === 'riff-sync';
  }

  private buildPersistedBindingAttrs(
    xiuyuan: Xiuyuan,
    persistedCardType: 'topic' | 'item' | undefined
  ): Record<string, string> | null {
    const attrs: Record<string, string> = {};

    if (!this.isManagedRiffXiuyuan(xiuyuan)) {
      attrs['custom-xiuyuan-id'] = xiuyuan.getId().getValue();
    }

    if (persistedCardType) {
      attrs[ATTR_CARD_TYPE] = persistedCardType;
    }

    return Object.keys(attrs).length > 0 ? attrs : null;
  }

  /**
   * 淇濆瓨 Xiuyuan 鑱氬悎鏍?
   * 
   * @param xiuyuan - Xiuyuan 鑱氬悎鏍?
   * @returns Result<void>
   */
  async save(xiuyuan: Xiuyuan): Promise<Result<void>> {
    try {
      const xiuyuanId = xiuyuan.getId().getValue();
      const persistedCardType = this.resolvePersistedCardType(xiuyuan);
      
      // 1. 杞崲涓烘寔涔呭寲妯″瀷
      const persistenceModel = this.toPersistenceWithId(xiuyuan);
      
      // 2. 妫€鏌ユ槸鍚﹀凡瀛樺湪
      const existing = this.storage.getXiuYuan(xiuyuanId);
      
      if (existing) {
        // 鏇存柊鐜版湁 XiuYuan - 鐩存帴鏇存柊 Map 涓殑鏁版嵁
        this.storage.upsertXiuYuan(persistenceModel);
      } else {
        // 鍒涘缓鏂?XiuYuan - 娣诲姞鍒?Map
        this.storage.upsertXiuYuan(persistenceModel);
      }

      // 3. 鍚屾鍗＄墖鐘舵€侊細淇濆瓨鐜版湁鍗＄墖锛屽垹闄ゅ凡绉婚櫎鐨勫崱鐗?
      const cards = xiuyuan.getCards();
      const currentCardIds = new Set(cards.map(card => card.getId().getValue()));
      
      // 3.1 鏌ユ壘闇€瑕佸垹闄ょ殑鍗＄墖锛堝瓨鍦ㄤ簬 storage 浣嗕笉鍦?xiuyuan 涓級
      const existingXiuyuanCards = this.storage.getCardsByXiuyuanId(xiuyuanId);
      const cardsToDelete = existingXiuyuanCards.filter(
        storageCard => !currentCardIds.has(storageCard.id)
      );
      
      // 3.2 鍒犻櫎宸茬Щ闄ょ殑鍗＄墖
      for (const cardToDelete of cardsToDelete) {
        await this.storage.deleteCard(cardToDelete.id);
      }
      
      // 3.3 淇濆瓨/鏇存柊褰撳墠鍗＄墖
      for (const card of cards) {
        const fsrsCard = await this.cardToFSRSCard(card, xiuyuan);  // 鉁?娣诲姞 await
        const existingCard = this.storage.getCard(card.getId().getValue());
        
        if (existingCard) {
          // 鏇存柊鐜版湁鍗＄墖
          await this.storage.updateCard(fsrsCard);
        } else {
          // 鍒涘缓鏂板崱鐗?
          await this.storage.createCard(persistenceModel, fsrsCard);
        }
      }
      
      // 馃殌 鏇存柊绱㈠紩锛氶噸寤鸿Xiuyuan鐨勬墍鏈夊崱鐗囩储寮?
      // 鍏堟竻鐞嗚Xiuyuan鐨勬墍鏈夋棫绱㈠紩
      for (const [cardId, indexedXiuyuanId] of this.cardToXiuyuanIndex.entries()) {
        if (indexedXiuyuanId === xiuyuanId) {
          this.cardToXiuyuanIndex.delete(cardId);
        }
      }
      // 鍐嶆坊鍔犲綋鍓嶇殑鍗＄墖绱㈠紩
      for (const card of cards) {
        this.cardToXiuyuanIndex.set(card.getId().getValue(), xiuyuanId);
      }
      
      // 馃殌 娓呯悊绱㈠紩锛氬垹闄ゅ凡绉婚櫎鍗＄墖鐨勭储寮曪紙棰濆淇濋櫓锛?
      for (const cardToDelete of cardsToDelete) {
        this.cardToXiuyuanIndex.delete(cardToDelete.id);
      }

      // 4. 馃敡 绔嬪嵆淇濆瓨锛堝垹闄ゆ搷浣滈渶瑕佺珛鍗虫寔涔呭寲锛岄伩鍏嶈鍚庣画鎿嶄綔瑕嗙洊锛?
      if (cardsToDelete.length > 0) {
        logger.info(`Deleted ${cardsToDelete.length} cards, forcing immediate save`);
        const saveResult = await this.storage.save();
        if (isErr(saveResult)) {
          const error = saveResult.error || new Error('Failed to save after deletion');
          logger.error('Failed to save after deletion:', error);
          return err(error);
        }
      }

      // 5. 鍐欏叆鍧楀睘鎬?
      const blockIDs = xiuyuan.getBlockIDs();
      const bindingAttrs = this.buildPersistedBindingAttrs(xiuyuan, persistedCardType);
      
      // 鉁?浣跨敤 Xiuyuan 瀹炰綋鏂规硶鑾峰彇浠ｈ〃鎬у潡 ID锛圖omain 灞傞€昏緫锛?
      const representativeBlockId = xiuyuan.getRepresentativeBlockId();
      const isDescriptorTemplate = representativeBlockId !== blockIDs[0]?.getValue();
      
      if (bindingAttrs && isDescriptorTemplate && blockIDs.length >= 2) {
        // 姒傚康-鎻忚堪绗﹀崱锛氱涓€涓潡鏄蹇靛崱锛岀浜屼釜鍧楁槸鎻忚堪绗﹀崱
        // 鈿狅笍 娉ㄦ剰锛氭蹇靛崱鍙兘宸茬粡鏈夎嚜宸辩殑 Xiuyuan锛堜綔涓虹嫭绔嬬殑姒傚康鍗★級
        // 鍥犳锛屾垜浠彧璁剧疆鎻忚堪绗﹀潡鐨勫睘鎬э紝涓嶄慨鏀规蹇靛崱鐨勫睘鎬?
        const descriptorBlockId = blockIDs[1].getValue();
        
        try {
          // 鍙缃弿杩扮鍗″睘鎬?
          await setBlockAttrs(descriptorBlockId, bindingAttrs);
          
          logger.debug(`Set descriptor attributes: descriptor=${descriptorBlockId}`);
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          const lowerErrorMsg = errorMsg.toLowerCase();
          if (!lowerErrorMsg.includes('not found') && !lowerErrorMsg.includes('tree not found')) {
            logger.warn('Failed to write descriptor attributes:', error);
          }
        }
      } else if (bindingAttrs && blockIDs.length > 0) {
        // 鍏朵粬妯℃澘锛氬彧璁剧疆浠ｈ〃鍧楋紙绗竴涓潡锛?
        const representativeBlockId = blockIDs[0].getValue();
        try {
          await setBlockAttrs(representativeBlockId, bindingAttrs);
        } catch (error) {
          // 鍧楀睘鎬у啓鍏ュけ璐ヤ笉搴旇闃绘淇濆瓨
          // 甯歌鍘熷洜锛氬潡宸茶鍒犻櫎銆佺Щ鍔ㄦ垨涓嶅瓨鍦?
          const errorMsg = error instanceof Error ? error.message : String(error);
          const lowerErrorMsg = errorMsg.toLowerCase();
          if (lowerErrorMsg.includes('not found') || lowerErrorMsg.includes('tree not found')) {
            // 鍧椾笉瀛樺湪锛岃繖鏄甯告儏鍐碉紙鐢ㄦ埛鍙兘鍒犻櫎浜嗗潡锛?
            logger.debug(`Block ${representativeBlockId} not found, skipping attribute write`);
          } else {
            // 鍏朵粬閿欒锛岃褰曡鍛?
            logger.warn('Failed to write block attributes:', error);
          }
        }
      }
      

      // 6. 鍙戝竷棰嗗煙浜嬩欢
      await this.publishDomainEvents(xiuyuan);

      return ok(undefined);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  private resolvePersistedCardType(xiuyuan: Xiuyuan): 'topic' | 'item' | undefined {
    const meta = xiuyuan.getMeta() as XiuyuanMeta | undefined;
    const progressiveKind = meta?.progressive && typeof meta.progressive === 'object'
      ? (meta.progressive as Record<string, unknown>).kind
      : undefined;
    if (progressiveKind === 'excerpt') {
      return undefined;
    }
    return meta?.cardType === 'topic' || meta?.cardType === 'item'
      ? meta.cardType
      : undefined;
  }

  /**
   * 鏍规嵁 ID 鏌ユ壘 Xiuyuan
   * 
   * @param id - Xiuyuan ID
   * @returns Result<Xiuyuan | null>
   */
  async findById(id: XiuyuanId): Promise<Result<Xiuyuan | null>> {
    try {
      const data = this.storage.getXiuYuan(id.getValue());
      if (!data) {
        return ok(null);
      }

      const result = this.toDomain(data);
      if (isErr(result)) {
        return result;
      }

      const candidate = this.buildCardIdRepairCandidate(data, result.value.cardIdStats);
      if (candidate) {
        await this.persistCardIdRepairs([candidate], 'findById');
      }

      return ok(result.value.xiuyuan);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * 鏍规嵁鍧?ID 鏌ユ壘 Xiuyuan
   * 
   * @param blockId - 鍧?ID
   * @returns Result<Xiuyuan[]>
   */
  async findByBlockId(blockId: BlockId): Promise<Result<Xiuyuan[]>> {
    try {
      // 閫氳繃 UnifiedStorageManager 鏌ヨ鎵€鏈?XiuYuans
      const allXiuyuans = this.storage.getAllXiuYuans();
      const xiuyuans: Xiuyuan[] = [];
      const repairCandidates: XiuyuanReadCardRepairCandidate[] = [];

      // 杩囨护鍖呭惈鎸囧畾 blockID 鐨?XiuYuans
      for (const data of allXiuyuans) {
        if (data.blockIDs.includes(blockId.getValue())) {
          const result = this.toDomain(data);
          if (result.ok && result.value.xiuyuan) {
            xiuyuans.push(result.value.xiuyuan);
            const candidate = this.buildCardIdRepairCandidate(data, result.value.cardIdStats);
            if (candidate) {
              repairCandidates.push(candidate);
            }
          }
        }
      }

      await this.persistCardIdRepairs(repairCandidates, 'findByBlockId');
      return ok(xiuyuans);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * 鏌ユ壘鎵€鏈?Xiuyuan
   * 
   * @returns Result<Xiuyuan[]>
   */
  async findAll(): Promise<Result<Xiuyuan[]>> {
    try {
      const dataList = this.storage.getAllXiuYuans();
      const xiuyuans: Xiuyuan[] = [];
      const repairCandidates: XiuyuanReadCardRepairCandidate[] = [];
      this.cardToXiuyuanIndex.clear();

      for (const data of dataList) {
        const result = this.toDomain(data);
        if (result.ok && result.value.xiuyuan) {
          xiuyuans.push(result.value.xiuyuan);
          const candidate = this.buildCardIdRepairCandidate(data, result.value.cardIdStats);
          if (candidate) {
            repairCandidates.push(candidate);
          }
          
          // 馃殌 鍒濆鍖栫储寮曪細鏋勫缓鍗＄墖ID -> XiuyuanID鏄犲皠
          const xiuyuan = result.value.xiuyuan;
          const xiuyuanId = xiuyuan.getId().getValue();
          for (const card of xiuyuan.getCards()) {
            this.cardToXiuyuanIndex.set(card.getId().getValue(), xiuyuanId);
          }
        }
      }

      await this.persistCardIdRepairs(repairCandidates, 'findAll');
      return ok(xiuyuans);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * 鍒犻櫎 Xiuyuan
   * 
   * @param xiuyuan - Xiuyuan 鑱氬悎鏍?
   * @returns Result<void>
   */
  async delete(xiuyuan: Xiuyuan): Promise<Result<void>> {
    try {
      const xiuyuanId = xiuyuan.getId().getValue();
      
      // 允许传入“已删空”的聚合，因此删除时按 xiuyuanId 清整组索引。
      for (const [cardId, indexedXiuyuanId] of this.cardToXiuyuanIndex.entries()) {
        if (indexedXiuyuanId === xiuyuanId) {
          this.cardToXiuyuanIndex.delete(cardId);
        }
      }

      const cards = xiuyuan.getCards();
      
      // 1. 浣跨敤 UnifiedStorageManager 鍒犻櫎 XiuYuan锛堜細绾ц仈鍒犻櫎鎵€鏈夊叧鑱斿崱鐗囷級
      const deleteResult = await this.storage.deleteXiuYuan(xiuyuanId);
      if (!deleteResult.ok) {
        return deleteResult;
      }

      // 2. 鍒犻櫎鍧楀睘鎬?
      const blockIDs = xiuyuan.getBlockIDs();
      if (!this.isManagedRiffXiuyuan(xiuyuan) && blockIDs.length > 0) {
        const representativeBlockId = blockIDs[0].getValue();
        try {
          await setBlockAttrs(representativeBlockId, {
            'custom-xiuyuan-id': '',
          });
        } catch (error) {
          logger.warn('Failed to clear block attributes:', error);
        }
      }

      // 3. 浠?Riff 鍒犻櫎
      if (cards.length > 0) {
        try {
          // Note: 瀹為檯鐨?Riff 鍒犻櫎闇€瑕佹牴鎹」鐩殑 API 瀹炵幇
          // const cardBlockIds = cards.map(card => card.getId().getValue());
          // await this.plugin.removeRiffCards(cardBlockIds);
        } catch (error) {
          logger.warn('Failed to remove from Riff:', error);
        }
      }

      // 4. 鍙戝竷棰嗗煙浜嬩欢
      await this.publishDomainEvents(xiuyuan);

      return ok(undefined);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * 鎵归噺淇濆瓨 Xiuyuan
   * 
   * @param xiuyuans - Xiuyuan 鍒楄〃
   * @returns Result<void>
   */
  async saveMany(xiuyuans: Xiuyuan[]): Promise<Result<void>> {
    try {
      for (const xiuyuan of xiuyuans) {
        const result = await this.save(xiuyuan);
        if (!result.ok) {
          return result;
        }
      }
      return ok(undefined);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * 鎵归噺鍒犻櫎 Xiuyuan
   * 
   * @param xiuyuans - Xiuyuan 鍒楄〃
   * @returns Result<void>
   */
  async deleteMany(xiuyuans: Xiuyuan[]): Promise<Result<void>> {
    try {
      for (const xiuyuan of xiuyuans) {
        const result = await this.delete(xiuyuan);
        if (!result.ok) {
          return result;
        }
      }
      return ok(undefined);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  // ============ 绉佹湁鏂规硶 ============

  private toXiuyuanMeta(meta: Record<string, unknown>): XiuyuanMeta {
    return meta as XiuyuanMeta;
  }

  private extractListTemplateChildren(meta: Record<string, unknown>): ListTemplateChild[] {
    const typedMeta = this.toXiuyuanMeta(meta);
    const children = typedMeta.listTemplate?.childrenData;
    if (!Array.isArray(children)) {
      return [];
    }
    return children.filter(isListTemplateChild);
  }

  private resolveListTemplateCurrentIndex(meta: Record<string, unknown>): number | null {
    const typedMeta = this.toXiuyuanMeta(meta);
    const currentIndex = typedMeta.listTemplate?.currentIndex;
    if (typeof currentIndex !== 'number' || !Number.isInteger(currentIndex) || currentIndex < 0) {
      return null;
    }
    return currentIndex;
  }

  private toFsrsCardType(cardType: XiuyuanCardType): CardType {
    switch (cardType) {
      case 'topic':
        return CardType.Topic;
      case 'concept':
        return CardType.Concept;
      case 'descriptor':
        return CardType.Descriptor;
      case 'cloze':
        return CardType.Item;
      case 'item':
      default:
        return CardType.Item;
    }
  }

  /**
   * 灏?Card 棰嗗煙瀹炰綋杞崲涓?FSRSCard
   * 
   * @param card - Card 棰嗗煙瀹炰綋
   * @param xiuyuan - 鍏宠仈鐨?Xiuyuan 鑱氬悎鏍?
   * @returns FSRSCard
   * @private
   */
  private async cardToFSRSCard(card: Card, xiuyuan: Xiuyuan): Promise<FSRSCard> {
    const scheduleInfo = card.getScheduleInfo();
    const meta = this.toXiuyuanMeta(xiuyuan.getMeta());
    const faceIndex = card.getFaceIndex();
    
    // Get schedulerType from meta, default to 'fsrs-v6' (Requirement 5.5)
    const schedulerType: SchedulerType = meta.schedulerType || 'fsrs-v6';
    
    // 鉁?纭畾鍗＄墖绫诲瀷锛堜娇鐢ㄤ笌鍧楀睘鎬х浉鍚岀殑閫昏緫锛?
    let cardType: XiuyuanCardType = 'item';
    
    // 馃啎 鑾峰彇妯℃澘锛堝湪澶栧眰澹版槑锛屼緵鍚庣画浣跨敤锛?
    const templateID = xiuyuan.getTemplateID().getValue();
    const template = this.templateRegistry.get(templateID);
    
    // 鉁?浣跨敤 Xiuyuan 瀹炰綋鏂规硶鑾峰彇浠ｈ〃鎬у潡 ID锛圖omain 灞傞€昏緫锛?
    const blockId = xiuyuan.getRepresentativeBlockId();
    logger.debug(`Using representative blockId: ${blockId}`);
    
    // 馃啎 浼樺厛浣跨敤 meta 涓槑纭寚瀹氱殑 cardType
    logger.debug('Checking meta.cardType:', meta.cardType, 'for blockId:', blockId);
    if (meta.cardType) {
      cardType = meta.cardType;
      logger.debug(`Using explicit cardType from meta: ${cardType}`);
    } else {
      if (template && (template.category === 'basic' || template.category === 'cloze')) {
        // 鉁?鍩虹绫绘ā鏉匡細榛樿涓?item
        cardType = 'item';
        logger.debug(`Template ${templateID} is basic/cloze category, card type: item`);
      } else if (this.extractListTemplateChildren(meta).length > 0) {
        // 鍒楄〃妯＄増鍗★細鎵€鏈夊瓙鍗＄墖閮芥槸 item 绫诲瀷
        cardType = 'item';
        logger.debug(`List template card detected, forcing cardType to 'item'`);
      } else if (this.cardTypeDetectionService && blockId) {
        // 鍏朵粬鎯呭喌锛氫娇鐢?CardTypeDetectionService 妫€娴?
        try {
          cardType = await this.cardTypeDetectionService.detectCardType(blockId);
          logger.debug(`Detected cardType for ${blockId}: ${cardType}`);
        } catch (error) {
          logger.warn(`Failed to detect cardType for ${blockId}, using default 'item':`, error);
        }
      }
    }
    
    // 馃啎 鍒楄〃妯＄増鍗★細鎻愬彇褰撳墠鍗＄墖鐨?cue銆乤nswer 鍜?allChildren
    const listTemplateMeta: Record<string, unknown> = {};
    const listTemplateChildren = this.extractListTemplateChildren(meta);
    const listTemplateIndex = this.resolveListTemplateCurrentIndex(meta) ?? faceIndex;
    if (listTemplateChildren.length > 0) {
      const currentChild = listTemplateChildren[listTemplateIndex] || listTemplateChildren[faceIndex];
      
      if (currentChild) {
        listTemplateMeta.cue = currentChild.cue;
        listTemplateMeta.answer = currentChild.answer;
        listTemplateMeta.currentIndex = listTemplateIndex;
        listTemplateMeta.allChildren = listTemplateChildren.map((child) => ({
          id: child.id,
          cue: child.cue,
          answer: child.answer,
          index: child.index
        }));
      }
    }

    const normalizedFieldMapping = normalizeFieldMapping(meta.fieldMapping);
    const imageOcclusionMeta = pickImageOcclusionMeta(meta);
    const explicitRenderProfile = typeof meta.renderProfile === 'string' ? meta.renderProfile : '';
    const templateCategory = template?.category || '';
    const fallbackQuickRenderProfile = !explicitRenderProfile && templateCategory === 'quick'
      ? 'quick-default'
      : '';
    
    // 馃啎 鎻愬彇 typeMarker锛堢敤浜庡弻鍚戝崱鐗囪瘑鍒鍙嶉潰锛?
    let typeMarker: string | undefined;
    if (template && template.cardRules && template.cardRules[faceIndex]) {
      typeMarker = template.cardRules[faceIndex].typeMarker;
      logger.debug(`Extracted typeMarker for faceIndex ${faceIndex}: ${typeMarker}`);
    }
    
    return {
      id: card.getId().getValue(),
      xiuyuanID: card.getXiuyuanId().getValue(),
      blockId,
      
      // FSRS 鏍稿績瀛楁
      due: scheduleInfo.due.getTime(),
      stability: scheduleInfo.stability,
      difficulty: scheduleInfo.difficulty,
      reps: scheduleInfo.reps,
      lapses: scheduleInfo.lapses,
      state: scheduleInfo.state,
      lastReview: scheduleInfo.lastReview.getTime(),
      elapsedDays: scheduleInfo.elapsedDays,
      scheduledDays: scheduleInfo.scheduledDays,
      learning_step: scheduleInfo.learning_step,
      
      // 绫诲瀷鍜屾ā鏉?
      type: this.toFsrsCardType(cardType),
      schedulerType: schedulerType, // Use schedulerType from meta (Requirement 5.5)
      
      // 浼樺厛绾?
      priority: xiuyuan.getPriority().getValue(),
      
      // 馃敡 淇锛欰-Factor锛堜粠 Xiuyuan.meta 澶嶅埗鍒?FSRSCard锛?
      aFactor: meta.aFactor,
      extractedFrom: typeof meta.extractedFrom === 'string' ? meta.extractedFrom : undefined,
      
      // 鎵╁睍鍔熻兘
      tags: [],
      leechCount: 0,
      isLeech: false,
      skipped: false,
      
      // 鍏冩暟鎹?
      meta: {
        ...imageOcclusionMeta,
        xiuyuanID: card.getXiuyuanId().getValue(),
        templateID: xiuyuan.getTemplateID().getValue(),
        faceIndex: faceIndex,
        ...(typeof meta.source === 'string' ? { source: meta.source } : {}),
        ...(meta.isDocument === true ? { isDocument: true } : {}),
        ...(meta.progressive && typeof meta.progressive === 'object' ? { progressive: meta.progressive } : {}),
        ...(meta.symbolDetected === true ? { symbolDetected: true } : {}),
        ...(typeof meta.cardSource === 'string' ? { cardSource: meta.cardSource } : {}),
        ...(typeof meta.symbolType === 'string' ? { symbolType: meta.symbolType } : {}),
        ...(typeof meta.clozeRenderMode === 'string' ? { clozeRenderMode: meta.clozeRenderMode } : {}),
        ...(explicitRenderProfile ? { renderProfile: explicitRenderProfile } : {}),
        ...(!explicitRenderProfile && fallbackQuickRenderProfile ? { renderProfile: fallbackQuickRenderProfile } : {}),
        ...(typeof meta.forceQuickRender === 'boolean' ? { forceQuickRender: meta.forceQuickRender } : {}),
        ...(typeof meta.quickDetectReason === 'string' ? { quickDetectReason: meta.quickDetectReason } : {}),
        // 鉁?浣跨敤 Xiuyuan 瀹炰綋鏂规硶鑾峰彇 blockIDs锛圖omain 灞傞€昏緫锛?
        frontBlockIDs: xiuyuan.getFrontBlockIDs(faceIndex),
        backBlockIDs: xiuyuan.getBackBlockIDs(faceIndex),
        ...(normalizedFieldMapping ? { fieldMapping: normalizedFieldMapping } : {}),
        // 馃啎 娣诲姞 faces 淇℃伅锛岀敤浜庡鎸栫┖鍗℃覆鏌?
        faces: xiuyuan.getFaces().map(face => ({
          question: face.question,
          answer: face.answer,
          questionBlockId: face.questionBlockId,
          answerBlockId: face.answerBlockId,
        })),
        // 馃啎 娣诲姞 typeMarker锛岀敤浜庡弻鍚戝崱鐗囪瘑鍒鍙嶉潰
        typeMarker,
        // 馃啎 鍒楄〃妯＄増鍗′笓鐢ㄥ瓧娈?
        ...listTemplateMeta,
      },
      
      // 鏃堕棿鎴?
      createdAt: card.getCreatedAt().getTime(),
      updatedAt: card.getUpdatedAt().getTime(),
    };
  }
  
  /**
   * 灏嗛鍩熸ā鍨嬭浆鎹负鎸佷箙鍖栨ā鍨嬶紙涓嶅寘鍚?ID 鍜屾椂闂存埑锛?
   * 
   * @param xiuyuan - Xiuyuan 鑱氬悎鏍?
   * @returns 鎸佷箙鍖栨ā鍨?
   * @private
   */
  private toPersistence(xiuyuan: Xiuyuan): Omit<IXiuyuan, 'id' | 'createdAt' | 'updatedAt'> {
    const faces = xiuyuan.getFaces();
    const cards = xiuyuan.getCards();
    const cardIds = cards.map(card => card.getId().getValue());
    
    logger.debug(`toPersistence: Xiuyuan ${xiuyuan.getId().getValue()} has ${cards.length} cards, cardIds:`, cardIds);
    
    return {
      blockIDs: xiuyuan.getBlockIDs().map(b => b.getValue()),
      fields: faces.map((face, index) => ({
        name: `face-${index}`,
        blockID: face.questionBlockId || xiuyuan.getBlockIDs()[0]?.getValue() || '',
        marker: 'question'
      })),
      templateID: xiuyuan.getTemplateID().getValue(),
      meta: {
        ...xiuyuan.getMeta(),
        priority: xiuyuan.getPriority().getValue(),
        faces: faces.map(face => ({
          question: face.question,
          answer: face.answer,
          questionBlockId: face.questionBlockId,
          answerBlockId: face.answerBlockId
        })),
        // 鉁?鍙瓨鍌?Card ID 寮曠敤锛屼笉瀛樺偍瀹屾暣鐨?Card 鏁版嵁
        cardIds
      }
    };
  }

  /**
   * 灏嗛鍩熸ā鍨嬭浆鎹负瀹屾暣鐨勬寔涔呭寲妯″瀷锛堝寘鍚?ID 鍜屾椂闂存埑锛?
   * 
   * @param xiuyuan - Xiuyuan 鑱氬悎鏍?
   * @returns 瀹屾暣鐨勬寔涔呭寲妯″瀷
   * @private
   */
  private toPersistenceWithId(xiuyuan: Xiuyuan): IXiuyuan {
    return {
      ...this.toPersistence(xiuyuan),
      id: xiuyuan.getId().getValue(),
      createdAt: xiuyuan.getCreatedAt().getTime(),
      updatedAt: xiuyuan.getUpdatedAt().getTime()
    };
  }

  /**
   * 浠?CardPersistenceDTO 閲嶅缓 Card 棰嗗煙瀹炰綋
   * 
   * @param dto - Card 鎸佷箙鍖?DTO
   * @param xiuyuanId - Xiuyuan ID
   * @returns Result<Card>
   * @private
   */
  private cardFromDTO(dto: CardPersistenceDTO, xiuyuanId: XiuyuanId): Result<Card> {
    try {
      const cardIdResult = CardId.create(dto.id);
      if (!cardIdResult.ok) return err(new Error(`Invalid CardId: ${dto.id}`));

      const scheduleInfoResult = ScheduleInfo.create({
        due: new Date(dto.due),
        stability: dto.stability,
        difficulty: dto.difficulty,
        reps: dto.reps,
        lapses: dto.lapses,
        state: dto.state as CardState,
        lastReview: new Date(dto.lastReview),
        elapsedDays: dto.elapsedDays,
        scheduledDays: dto.scheduledDays,
        learning_step: dto.learning_step
      });
      if (!scheduleInfoResult.ok) return err(new Error('Invalid ScheduleInfo'));

      const faceIndex = readFiniteNumber(dto.meta?.faceIndex) ?? readFiniteNumber(dto.meta?.ruleIndex) ?? 0;

      const cardResult = Card.create({
        id: cardIdResult.value,
        xiuyuanId: xiuyuanId,
        faceIndex,
        scheduleInfo: scheduleInfoResult.value,
        createdAt: new Date(dto.createdAt),
        updatedAt: new Date(dto.updatedAt)
      });

      return cardResult;
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * 灏嗘寔涔呭寲妯″瀷杞崲涓洪鍩熸ā鍨?
   * 
   * @param data - 鎸佷箙鍖栨ā鍨?
   * @returns Result<Xiuyuan | null>
   * @private
   */
  private toDomain(data: IXiuyuan): Result<{ xiuyuan: Xiuyuan | null; cardIdStats: CardIdResolutionStats }> {
    try {
      // 1. 杞崲 ID
      const idResult = XiuyuanId.create(data.id);
      if (!idResult.ok) return err(new Error(`Invalid XiuyuanId: ${data.id}`));

      // 2. 杞崲 BlockIDs
      const blockIDResults = data.blockIDs.map(id => BlockId.create(id));
      const failedBlockId = blockIDResults.find(r => !r.ok);
      if (failedBlockId) return err(new Error(`Invalid BlockId in blockIDs`));
      const blockIDs = blockIDResults.map(r => r.ok ? r.value : null).filter((v): v is BlockId => v !== null);

      // 3. 杞崲 TemplateID
      const templateIDResult = TemplateId.create(data.templateID);
      if (!templateIDResult.ok) return err(new Error(`Invalid TemplateId: ${data.templateID}`));

      // 4. 杞崲 Faces锛堜粠 meta 涓仮澶嶏級
      const rawFaces = data.meta?.faces;
      const facesData = Array.isArray(rawFaces) ? rawFaces.filter(isFaceSnapshot) : [];
      const faceResults = facesData.map(f => CardFace.create({
        question: f.question,
        answer: f.answer,
        questionBlockId: f.questionBlockId,
        answerBlockId: f.answerBlockId
      }));
      const failedFace = faceResults.find(r => !r.ok);
      if (failedFace) return err(new Error(`Invalid CardFace in faces`));
      const faces = faceResults.map(r => r.ok ? r.value : null).filter((v): v is CardFace => v !== null);

      // 5. 杞崲 Priority
      const priorityValue = (data.meta?.priority as number) || 0;
      const priorityResult = Priority.create(priorityValue);
      if (!priorityResult.ok) {
        // 濡傛灉浼樺厛绾ф棤鏁堬紝浣跨敤榛樿鍊?
        logger.warn('Invalid priority value, using default:', priorityValue);
      }
      const priority = priorityResult.ok ? priorityResult.value : Priority.createDefault();

      // 6. 杞崲 Cards锛堜粠 cardIds 鍔犺浇锛?
      const cardsMap = new Map<CardId, Card>();
      const cardIds = this.extractCardIdsFromMeta(data.meta);
      const missingDtoCardIds: string[] = [];
      const resolvedCardIds: string[] = [];
      
      logger.debug(`toDomain: Xiuyuan ${data.id} has ${cardIds.length} cardIds in meta`);
      
      for (const cardId of cardIds) {
        const cardDTO = this.storage.getCardDTO(cardId);
        if (!cardDTO) {
          missingDtoCardIds.push(cardId);
          continue;
        }
        
        const cardResult = this.cardFromDTO(cardDTO, idResult.value);
        if (cardResult.ok) {
          const cardIdObj = CardId.create(cardId);
          if (cardIdObj.ok) {
            cardsMap.set(cardIdObj.value, cardResult.value);
            resolvedCardIds.push(cardId);
          }
        }
      }

      if (missingDtoCardIds.length > 0) {
        logger.debug('Missing card DTO references detected', {
          xiuyuanId: data.id,
          missingCount: missingDtoCardIds.length,
          sampleMissingCardIds: missingDtoCardIds.slice(0, CARD_ID_DEBUG_SAMPLE_LIMIT),
        });
      }
      
      logger.debug(`toDomain: Loaded ${cardsMap.size} cards for Xiuyuan ${data.id}`);

      // 7. 閲嶅缓 Xiuyuan
      const xiuyuanProps: XiuyuanProps = {
        id: idResult.value,
        blockIDs,
        templateID: templateIDResult.value,
        faces,
        priority,
        cards: cardsMap,
        meta: data.meta || {},
        createdAt: new Date(data.createdAt),
        updatedAt: new Date(data.updatedAt)
      };

      const xiuyuanResult = Xiuyuan.reconstitute(xiuyuanProps);
      if (isErr(xiuyuanResult)) {
        return xiuyuanResult;
      }

      return ok({
        xiuyuan: xiuyuanResult.value,
        cardIdStats: {
          sourceCardIds: cardIds,
          resolvedCardIds,
          missingDtoCardIds,
        },
      });
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * 鍙戝竷棰嗗煙浜嬩欢
   * 
   * @param xiuyuan - Xiuyuan 鑱氬悎鏍?
   * @private
   */
  private extractCardIdsFromMeta(meta: Record<string, unknown> | undefined): string[] {
    if (!meta) {
      return [];
    }

    const rawCardIds = meta.cardIds;
    if (!Array.isArray(rawCardIds)) {
      return [];
    }

    return rawCardIds.filter((cardId): cardId is string => {
      return typeof cardId === 'string' && cardId.trim().length > 0;
    });
  }

  private areCardIdArraysEqual(left: string[], right: string[]): boolean {
    if (left.length !== right.length) {
      return false;
    }
    for (let i = 0; i < left.length; i += 1) {
      if (left[i] !== right[i]) {
        return false;
      }
    }
    return true;
  }

  private toResolvedCardIdList(sourceCardIds: string[], resolvedCardIds: string[]): string[] {
    if (sourceCardIds.length === 0) {
      return [];
    }
    const resolvedSet = new Set(resolvedCardIds);
    return sourceCardIds.filter((cardId) => resolvedSet.has(cardId));
  }

  private buildCardIdRepairCandidate(
    data: IXiuyuan,
    cardIdStats: CardIdResolutionStats
  ): XiuyuanReadCardRepairCandidate | null {
    const repairedCardIds = this.toResolvedCardIdList(cardIdStats.sourceCardIds, cardIdStats.resolvedCardIds);
    if (this.areCardIdArraysEqual(cardIdStats.sourceCardIds, repairedCardIds)) {
      return null;
    }

    const repairedMeta: Record<string, unknown> = data.meta ? { ...data.meta } : {};
    repairedMeta.cardIds = repairedCardIds;

    return {
      xiuyuanId: data.id,
      removedCount: Math.max(0, cardIdStats.sourceCardIds.length - repairedCardIds.length),
      persisted: {
        ...data,
        meta: repairedMeta,
        updatedAt: Date.now(),
      },
    };
  }

  private async persistCardIdRepairs(
    candidates: XiuyuanReadCardRepairCandidate[],
    source: 'findById' | 'findByBlockId' | 'findAll'
  ): Promise<void> {
    if (candidates.length === 0) {
      return;
    }

    try {
      for (const candidate of candidates) {
        this.storage.upsertXiuYuan(candidate.persisted);
      }

      const removedCount = candidates.reduce((sum, candidate) => sum + candidate.removedCount, 0);
      logger.debug('Repairing stale Xiuyuan cardIds references', {
        source,
        repairedXiuyuanCount: candidates.length,
        removedCardIdReferences: removedCount,
        sampleXiuyuanIds: candidates.slice(0, CARD_ID_DEBUG_SAMPLE_LIMIT).map((candidate) => candidate.xiuyuanId),
      });

      const saveResult = await this.storage.save();
      if (isErr(saveResult)) {
        logger.error('Failed to persist repaired Xiuyuan cardIds', {
          source,
          error: saveResult.error,
        });
        return;
      }

      logger.debug('Persisted repaired Xiuyuan cardIds', {
        source,
        repairedXiuyuanCount: candidates.length,
      });
    } catch (error) {
      logger.error('Failed to apply Xiuyuan cardIds repair', {
        source,
        error,
      });
    }
  }

  private async publishDomainEvents(xiuyuan: Xiuyuan): Promise<void> {
    const events = xiuyuan.getDomainEvents();
    
    // 鉁?鍙褰曚簨浠讹紝涓嶆竻闄?
    // 浜嬩欢鐨勫彂甯冨拰娓呴櫎鐢?UseCase 璐熻矗
    for (const event of events) {
      logger.debug('Domain event:', event.getEventName());
    }
  }
}
