/**
 * CardTypeMarkerService
 * 
 * 绠＄悊鍗＄墖绫诲瀷鏍囪绯荤粺锛屾彁渚涙蹇靛崱鍜屾弿杩扮鍗＄殑鏍囪鍔熻兘銆?
 * 
 * 鑱岃矗锛?
 * - 璁剧疆鍜岃幏鍙栧崱鐗囩被鍨嬫爣璁帮紙concept/descriptor锛?
 * - 鏍规嵁绫诲瀷鏍囪鎺ㄥ鎶€鏈被鍨嬶紙item/topic锛?
 * - 鍚屾鍧楀睘鎬?
 * - 鎵归噺鎿嶄綔鏀寔
 * 
 * @see .kiro/specs/card-type-system-enhancement/design.md 绗?2.1 鑺?
 */

import type { FSRSCard } from '@/types/card';
import { CardType } from '@/types/card';
import type { CardTypeMarkerStoragePort } from '@/core/storage/ports';
import { TYPE_MAPPING } from './type-mapping';
import { createLogger } from '@/utils/logger';

const logger = createLogger('CardTypeMarkerService');

/** 鍗＄墖绫诲瀷鏍囪 */
export type CardTypeMarker = 'concept' | 'descriptor';

/**
 * 鍗＄墖绫诲瀷鏍囪鏈嶅姟
 */
export class CardTypeMarkerService {
  private storage: CardTypeMarkerStoragePort;
  private markerCache: Map<string, CardTypeMarker> = new Map();

  constructor(storage: CardTypeMarkerStoragePort) {
    this.storage = storage;
  }

  /**
   * 璁剧疆鍗＄墖绫诲瀷鏍囪
   * 
   * @param cardId - 鍗＄墖 ID
   * @param marker - 绫诲瀷鏍囪锛坈oncept 鎴?descriptor锛?
   * 
   * @example
   * ```typescript
   * await service.setCardTypeMarker('card-1', 'concept');
   * ```
   */
  async setCardTypeMarker(cardId: string, marker: CardTypeMarker): Promise<void> {
    const card = this.storage.getCard(cardId);
    if (!card) {
      throw new Error(`Card not found: ${cardId}`);
    }

    // 1. 鏇存柊鍗＄墖鐨勭被鍨嬫爣璁?
    card.cardTypeMarker = marker;

    // 2. 鏍规嵁鏍囪鎺ㄥ鎶€鏈被鍨?
    card.type = this.inferTechnicalType(marker);

    // 3. 鏇存柊瀛樺偍
    this.storage.setCard(card);
    await this.storage.saveCards();

    // 5. 鏇存柊缂撳瓨
    this.markerCache.set(cardId, marker);

    logger.info(`Set card type marker: ${cardId} -> ${marker} (type: ${card.type})`);
  }

  /**
   * 鑾峰彇鍗＄墖绫诲瀷鏍囪
   * 
   * @param cardId - 鍗＄墖 ID
   * @returns 绫诲瀷鏍囪锛屽鏋滄湭璁剧疆鍒欒繑鍥?undefined
   * 
   * @example
   * ```typescript
   * const marker = service.getCardTypeMarker('card-1');
   * if (marker === 'concept') {
   *   console.log('This is a concept card');
   * }
   * ```
   */
  getCardTypeMarker(cardId: string): CardTypeMarker | undefined {
    // 1. 妫€鏌ョ紦瀛?
    if (this.markerCache.has(cardId)) {
      return this.markerCache.get(cardId);
    }

    // 2. 浠庡瓨鍌ㄨ鍙?
    const card = this.storage.getCard(cardId);
    const marker = card?.cardTypeMarker;

    // 3. 鏇存柊缂撳瓨
    if (marker) {
      this.markerCache.set(cardId, marker);
    }

    return marker;
  }

  /**
   * 鏍规嵁绫诲瀷鏍囪鎺ㄥ鎶€鏈被鍨?
   * 
   * 鏄犲皠瑙勫垯锛?
   * - concept -> concept (浣跨敤 FSRS 璋冨害鍣?
   * - descriptor -> descriptor (浣跨敤 FSRS 璋冨害鍣?
   * 
   * @param marker - 绫诲瀷鏍囪
   * @returns 鎶€鏈被鍨?
   * 
   * @example
   * ```typescript
   * const type = service.inferTechnicalType('concept');
   * console.log(type); // 'concept'
   * ```
   */
  inferTechnicalType(marker: CardTypeMarker): CardType {
    return TYPE_MAPPING[marker];
  }

  /**
   * 鎵归噺璁剧疆绫诲瀷鏍囪
   * 
   * @param cardIds - 鍗＄墖 ID 鍒楄〃
   * @param marker - 绫诲瀷鏍囪
   * 
   * @example
   * ```typescript
   * await service.batchSetMarker(['card-1', 'card-2'], 'concept');
   * ```
   */
  async batchSetMarker(cardIds: string[], marker: CardTypeMarker): Promise<void> {
    const technicalType = this.inferTechnicalType(marker);

    // 1. 鎵归噺鏇存柊鍗＄墖
    for (const cardId of cardIds) {
      const card = this.storage.getCard(cardId);
      if (!card) {
        logger.warn(`Card not found: ${cardId}`);
        continue;
      }

      card.cardTypeMarker = marker;
      card.type = technicalType;
      this.storage.setCard(card);

      // 鏇存柊缂撳瓨
      this.markerCache.set(cardId, marker);
    }

    // 2. 鎵归噺淇濆瓨
    await this.storage.saveCards();


    logger.info(`Batch set marker: ${cardIds.length} cards -> ${marker}`);
  }


  /**
   * 娓呴櫎缂撳瓨
   * 
   * 鍦ㄩ渶瑕佸己鍒堕噸鏂拌鍙栨暟鎹椂璋冪敤
   */
  clearCache(): void {
    this.markerCache.clear();
  }

  /**
   * 楠岃瘉绫诲瀷鏄犲皠涓€鑷存€?
   * 
   * 妫€鏌ュ崱鐗囩殑 cardTypeMarker 鍜?type 瀛楁鏄惁绗﹀悎鏄犲皠瑙勫垯
   * 
   * @param card - 鍗＄墖瀵硅薄
   * @returns 鏄惁涓€鑷?
   */
  validateTypeMapping(card: FSRSCard): boolean {
    if (!card.cardTypeMarker) {
      return true; // 娌℃湁鏍囪鐨勫崱鐗囦笉闇€瑕侀獙璇?
    }

    const expectedType = this.inferTechnicalType(card.cardTypeMarker);
    return card.type === expectedType;
  }

  /**
   * 淇绫诲瀷鏄犲皠涓嶄竴鑷寸殑鍗＄墖
   * 
   * 鎵弿鎵€鏈夊崱鐗囷紝淇绫诲瀷鏄犲皠涓嶄竴鑷寸殑鎯呭喌
   * 
   * @returns 淇鐨勫崱鐗囨暟閲?
   */
  async fixInconsistentCards(): Promise<number> {
    let candidateIds: string[] | undefined;
    try {
      candidateIds = this.storage.queryInconsistentCardTypeMarkerIds?.();
    } catch (error) {
      logger.debug('SQL card type marker candidate query failed; falling back to full scan', { error });
      candidateIds = undefined;
    }
    const allCards = candidateIds
      ? candidateIds
        .map((cardId) => this.storage.getCard(cardId))
        .filter((card): card is FSRSCard => Boolean(card))
      : this.storage.getAllCards();
    let fixedCount = 0;

    for (const card of allCards) {
      if (!this.validateTypeMapping(card)) {
        const expectedType = this.inferTechnicalType(card.cardTypeMarker!);
        logger.warn(
          `Fixing inconsistent card: ${card.id} ` +
          `(marker: ${card.cardTypeMarker}, type: ${card.type} -> ${expectedType})`
        );

        card.type = expectedType;
        this.storage.setCard(card);
        fixedCount++;
      }
    }

    if (fixedCount > 0) {
      await this.storage.saveCards();
      logger.info(`Fixed ${fixedCount} inconsistent cards`);
    }

    return fixedCount;
  }
}
