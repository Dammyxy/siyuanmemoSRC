/**
 * UnifiedStorageManager - 缁熶竴瀛樺偍绠＄悊鍣?
 * 
 * @module UnifiedStorageManager
 * @description
 * 缁熶竴绠＄悊 XiuYuan 鍜?FSRSCard 鏁版嵁锛屼娇鐢?MessagePack 鏍煎紡鎸佷箙鍖栵紝
 * 鎻愪緵鍐呭瓨绱㈠紩浠ユ敮鎸侀珮鎬ц兘鏌ヨ锛? 100ms for 100,000 cards锛夈€?
 * 
 * **鏍稿績鍔熻兘**锛?
 * - 缁熶竴瀛樺偍锛歑iuYuan 鍜?Card 瀛樺偍鍦ㄥ悓涓€涓?MessagePack 鏂囦欢
 * - 鍐呭瓨绱㈠紩锛歜lockID, xiuyuanID, type, due, priority 绱㈠紩
 * - 闃叉姈淇濆瓨锛? 绉掑欢杩熻嚜鍔ㄤ繚瀛橈紝閬垮厤棰戠箒 I/O
 * - 鏁版嵁涓€鑷存€э細妫€娴嬪鍎垮崱鐗囥€佺┖ XiuYuan銆佹棤鏁堝紩鐢?
 * 
 * **鎬ц兘瑕佹眰**锛?
 * - 鍔犺浇 100,000 鍗＄墖 < 2s
 * - 鏌ヨ鍒版湡鍗＄墖 < 100ms
 * - 鍒涘缓/鍒犻櫎/鏇存柊鍗＄墖 < 50ms
 * 
 * **Validates: Requirements 1.1, 1.2, 1.6**
 */

import type { FSRSCard, CardType } from '../../types/card';
import type { IXiuyuan } from '../xiuyuan/types';
import type { Result } from '../../types/result';
import { ok, err } from '../../types/result';
import type { CardPersistenceDTO } from '../../infrastructure/persistence/dto/CardPersistenceDTO';
import { CardMapper } from '../../infrastructure/persistence/mappers/CardMapper';

/**
 * 缁熶竴瀛樺偍鏁版嵁缁撴瀯
 */
export interface UnifiedCardStore {
  version: number;
  xiuyuans: Record<string, IXiuyuan>;
  cards: Record<string, FSRSCard>;
  cardDTOs?: Record<string, CardPersistenceDTO>;
  riffBlacklist?: string[];
}

/**
 * 瀛樺偍缁熻淇℃伅
 */
export interface StorageStats {
  totalCards: number;
  totalXiuYuans: number;
  cardsByType: Record<CardType, number>;
  dueCards: number;
  newCards: number;
  learningCards: number;
  reviewCards: number;
}

/**
 * 缁熶竴瀛樺偍绠＄悊鍣?
 */
export class UnifiedStorageManager {
  // === 鏁版嵁瀛樺偍 ===
  private xiuyuans: Map<string, IXiuyuan> = new Map();
  private cardDTOs: Map<string, CardPersistenceDTO> = new Map();  // 鉁?鍙淮鎶?DTO Map
  private riffBlacklist: Set<string> = new Set();

  // === 鍐呭瓨绱㈠紩 ===
  private indexByBlockID: Map<string, string[]> = new Map();
  private indexByXiuyuanID: Map<string, string[]> = new Map();
  private indexByType: Map<CardType, string[]> = new Map();
  private indexByDue: FSRSCard[] = [];
  private indexByPriority: Map<number, string[]> = new Map();

  // === 鑴忔爣璁板拰鑷姩淇濆瓨 ===
  private dirty: boolean = false;
  private saveTimer: NodeJS.Timeout | null = null;
  private readonly SAVE_DELAY = 1000; // 1 绉掑欢杩?

  // === 鎸佷箙鍖栧洖璋?===
  private saveCallback: ((data: UnifiedCardStore) => Promise<void>) | null = null;
  private loadCallback: (() => Promise<UnifiedCardStore>) | null = null;

  /**
   * 鉁?鏋勯€犲嚱鏁帮細纭繚鎵€鏈?Map 閮藉凡鍒濆鍖?
   */
  constructor() {
    // 闃插尽鎬ф鏌ワ細纭繚鎵€鏈?Map 閮藉凡鍒濆鍖?
    if (!this.cardDTOs) {
      console.warn('[UnifiedStorageManager] cardDTOs not initialized in constructor, re-initializing...');
      this.cardDTOs = new Map();
    }
    if (!this.xiuyuans) {
      console.warn('[UnifiedStorageManager] xiuyuans not initialized in constructor, re-initializing...');
      this.xiuyuans = new Map();
    }
    if (!this.indexByBlockID) {
      this.indexByBlockID = new Map();
    }
    if (!this.indexByXiuyuanID) {
      this.indexByXiuyuanID = new Map();
    }
    if (!this.indexByType) {
      this.indexByType = new Map();
    }
    if (!this.indexByDue) {
      this.indexByDue = [];
    }
    if (!this.indexByPriority) {
      this.indexByPriority = new Map();
    }
  }

  /**
   * 璁剧疆鎸佷箙鍖栧洖璋?
   * @param save 淇濆瓨鍥炶皟鍑芥暟锛堟帴鏀舵暟鎹綔涓哄弬鏁帮級
   * @param load 鍔犺浇鍥炶皟鍑芥暟
   */
  setPersistenceCallbacks(
    save: (data: UnifiedCardStore) => Promise<void>,
    load: () => Promise<UnifiedCardStore>
  ): void {
    this.saveCallback = save;
    this.loadCallback = load;
  }

  /**
   * 鍔犺浇鏁版嵁
   */
  async load(): Promise<Result<void>> {
    try {
      if (!this.loadCallback) {
        return err(new Error('Load callback not set'));
      }

      const store = await this.loadCallback();

      // 娓呯┖鐜版湁鏁版嵁
      this.xiuyuans.clear();
      this.cardDTOs.clear();
      this.riffBlacklist.clear();

      // 鍔犺浇 XiuYuans
      for (const [id, xiuyuan] of Object.entries(store.xiuyuans)) {
        this.xiuyuans.set(id, xiuyuan);
      }

      // 鉁?浼樺厛鍔犺浇 CardDTOs锛堟柊鏋舵瀯锛?
      if (store.cardDTOs && Object.keys(store.cardDTOs).length > 0) {
        // 浠?CardDTOs 鍔犺浇锛堟柊鏋舵瀯锛?
        for (const [id, dto] of Object.entries(store.cardDTOs)) {
          this.cardDTOs.set(id, dto);
        }
      } else {
        // 闄嶇骇锛氫粠 Cards 鍔犺浇锛堟棫鏁版嵁鍏煎锛岃嚜鍔ㄨ縼绉伙級
        for (const [id, card] of Object.entries(store.cards)) {
          const dto = CardMapper.toPersistence(card);
          this.cardDTOs.set(id, dto);
        }
        console.log('[UnifiedStorageManager] 鈿狅笍 Migrated old cards data to cardDTOs format');
      }

      // 閲嶅缓绱㈠紩
      if (Array.isArray(store.riffBlacklist)) {
        this.riffBlacklist = new Set(
          store.riffBlacklist.filter((id): id is string => typeof id === 'string' && id.length > 0)
        );
      }
      this.rebuildIndexes();

      this.dirty = false;
      return ok(undefined);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * 淇濆瓨鏁版嵁
   */
  async save(): Promise<Result<void>> {
    try {
      if (!this.saveCallback) {
        return err(new Error('Save callback not set'));
      }

      // 鑾峰彇褰撳墠鏁版嵁骞朵紶閫掔粰淇濆瓨鍥炶皟
      const storeData = this.getStoreData();
      await this.saveCallback(storeData);
      this.dirty = false;

      // 娓呴櫎淇濆瓨瀹氭椂鍣?
      if (this.saveTimer) {
        clearTimeout(this.saveTimer);
        this.saveTimer = null;
      }

      return ok(undefined);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * 璋冨害淇濆瓨锛堥槻鎶栵級
   */
  private scheduleSave(): void {
    this.dirty = true;

    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
    }

    this.saveTimer = setTimeout(() => {
      this.save().catch(error => {
        console.error('Failed to auto-save:', error);
      });
    }, this.SAVE_DELAY);
  }

  /**
   * 閲嶅缓鎵€鏈夌储寮?
   */
  private rebuildIndexes(): void {
    // 娓呯┖绱㈠紩
    this.indexByBlockID.clear();
    this.indexByXiuyuanID.clear();
    this.indexByType.clear();
    this.indexByDue = [];
    this.indexByPriority.clear();

    // 閲嶅缓绱㈠紩
    for (const dto of this.cardDTOs.values()) {
      const card = CardMapper.toDomain(dto);
      this.updateIndexesForCard(card, 'add');
    }

    // 鎺掑簭 due 绱㈠紩
    this.indexByDue.sort((a, b) => a.due - b.due);
  }

  /**
   * 鏇存柊鍗＄墖绱㈠紩
   * @param card 鍗＄墖
   * @param action 鎿嶄綔绫诲瀷锛坅dd 鎴?remove锛?
   */
  private updateIndexesForCard(card: FSRSCard, action: 'add' | 'remove'): void {
    if (action === 'add') {
      // blockID 绱㈠紩
      const blockCards = this.indexByBlockID.get(card.blockId) || [];
      if (!blockCards.includes(card.id)) {
        blockCards.push(card.id);
        this.indexByBlockID.set(card.blockId, blockCards);
      }

      // xiuyuanID 绱㈠紩
      const xiuyuanID = card.meta?.xiuyuanID;
      if (xiuyuanID) {
        const xiuyuanCards = this.indexByXiuyuanID.get(xiuyuanID) || [];
        if (!xiuyuanCards.includes(card.id)) {
          xiuyuanCards.push(card.id);
          this.indexByXiuyuanID.set(xiuyuanID, xiuyuanCards);
        }
      }

      // type 绱㈠紩
      const typeCards = this.indexByType.get(card.type) || [];
      if (!typeCards.includes(card.id)) {
        typeCards.push(card.id);
        this.indexByType.set(card.type, typeCards);
      }

      // due 绱㈠紩
      this.indexByDue.push(card);

      // priority 绱㈠紩
      const priorityCards = this.indexByPriority.get(card.priority) || [];
      if (!priorityCards.includes(card.id)) {
        priorityCards.push(card.id);
        this.indexByPriority.set(card.priority, priorityCards);
      }
    } else {
      // 绉婚櫎 blockID 绱㈠紩
      const blockCards = this.indexByBlockID.get(card.blockId);
      if (blockCards) {
        const index = blockCards.indexOf(card.id);
        if (index !== -1) {
          blockCards.splice(index, 1);
        }
        if (blockCards.length === 0) {
          this.indexByBlockID.delete(card.blockId);
        }
      }

      // 绉婚櫎 xiuyuanID 绱㈠紩
      const xiuyuanID = card.meta?.xiuyuanID;
      if (xiuyuanID) {
        const xiuyuanCards = this.indexByXiuyuanID.get(xiuyuanID);
        if (xiuyuanCards) {
          const index = xiuyuanCards.indexOf(card.id);
          if (index !== -1) {
            xiuyuanCards.splice(index, 1);
          }
          if (xiuyuanCards.length === 0) {
            this.indexByXiuyuanID.delete(xiuyuanID);
          }
        }
      }

      // 绉婚櫎 type 绱㈠紩
      const typeCards = this.indexByType.get(card.type);
      if (typeCards) {
        const index = typeCards.indexOf(card.id);
        if (index !== -1) {
          typeCards.splice(index, 1);
        }
        if (typeCards.length === 0) {
          this.indexByType.delete(card.type);
        }
      }

      // 绉婚櫎 due 绱㈠紩
      const dueIndex = this.indexByDue.findIndex(c => c.id === card.id);
      if (dueIndex !== -1) {
        this.indexByDue.splice(dueIndex, 1);
      }

      // 绉婚櫎 priority 绱㈠紩
      const priorityCards = this.indexByPriority.get(card.priority);
      if (priorityCards) {
        const index = priorityCards.indexOf(card.id);
        if (index !== -1) {
          priorityCards.splice(index, 1);
        }
        if (priorityCards.length === 0) {
          this.indexByPriority.delete(card.priority);
        }
      }
    }
  }

  /**
   * 鑾峰彇瀛樺偍鏁版嵁锛堢敤浜庢寔涔呭寲锛?
   */
  getStoreData(): UnifiedCardStore {
    const xiuyuans: Record<string, IXiuyuan> = {};
    for (const [id, xiuyuan] of this.xiuyuans.entries()) {
      xiuyuans[id] = xiuyuan;
    }

    const cardDTOs: Record<string, CardPersistenceDTO> = {};
    for (const [id, dto] of this.cardDTOs.entries()) {
      cardDTOs[id] = dto;
    }

    // 鉁?涓轰簡鍚戝悗鍏煎锛屼粛鐒朵繚瀛?cards 瀛楁锛堜粠 cardDTOs 杞崲锛?
    const cards: Record<string, FSRSCard> = {};
    for (const [id, dto] of this.cardDTOs.entries()) {
      cards[id] = CardMapper.toDomain(dto);
    }

    return {
      version: 1,
      xiuyuans,
      cards,  // 鍚戝悗鍏煎
      cardDTOs,  // 涓绘暟鎹簮
      riffBlacklist: Array.from(this.riffBlacklist),
    };
  }

  // === CRUD 鎿嶄綔 ===

  /**
   * 鍒涘缓鍗＄墖
   * @param xiuyuan XiuYuan 瀹炰綋
   * @param card FSRSCard 瀹炰綋
   */
  async createCard(xiuyuan: IXiuyuan, card: FSRSCard): Promise<Result<void>> {
    try {
      // 杞崲 FSRSCard 涓?DTO
      const dto = CardMapper.toPersistence(card);
      
      // 璋冪敤 DTO 鏂规硶锛堜繚鎸佸悜鍚庡吋瀹癸級
      return await this.createCardDTO(xiuyuan, dto);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * 鎵归噺鍒涘缓鍗＄墖
   * @param xiuyuan XiuYuan 瀹炰綋
   * @param cards FSRSCard 瀹炰綋鏁扮粍
   */
  /**
     * 鎵归噺鍒涘缓鍗＄墖锛堝師瀛愭€ф搷浣滐級
     * @param xiuyuan XiuYuan 瀹炰綋
     * @param cards 鍗＄墖鏁扮粍
     * @returns 鎴愬姛鎴栧け璐ョ粨鏋?
     * 
     * 鐗规€э細
     * - 鍘熷瓙鎬э細瑕佷箞鍏ㄩ儴鎴愬姛锛岃涔堝叏閮ㄥけ璐?
     * - 澶辫触鍥炴粴锛氬鏋滀换浣曟搷浣滃け璐ワ紝鍥炴粴鎵€鏈夋洿鏀?
     * - 鎬ц兘浼樺寲锛氫竴娆℃€ф洿鏂扮储寮曪紝涓€娆′繚瀛?
     */
    async batchCreateCards(xiuyuan: IXiuyuan, cards: FSRSCard[]): Promise<Result<void>> {
      // 楠岃瘉杈撳叆
      if (!xiuyuan || !xiuyuan.id) {
        return err(new Error('Invalid xiuyuan: missing id'));
      }
      if (!cards || cards.length === 0) {
        return err(new Error('Invalid cards: empty array'));
      }

      // 楠岃瘉鎵€鏈夊崱鐗?
      for (const card of cards) {
        if (!card.id) {
          return err(new Error('Invalid card: missing id'));
        }
        const cardXiuyuanID = card.meta?.xiuyuanID as string | undefined;
        if (cardXiuyuanID && cardXiuyuanID !== xiuyuan.id) {
          return err(new Error(`Card ${card.id} xiuyuanID mismatch: expected ${xiuyuan.id}, got ${cardXiuyuanID}`));
        }
        if (this.cardDTOs.has(card.id)) {
          return err(new Error(`Card ${card.id} already exists`));
        }
      }

      // 淇濆瓨鍘熷鐘舵€佺敤浜庡洖婊?
      const xiuyuanExisted = this.xiuyuans.has(xiuyuan.id);
      const originalXiuyuan = xiuyuanExisted ? this.xiuyuans.get(xiuyuan.id) : undefined;

      // 淇濆瓨鍘熷绱㈠紩鐘舵€侊紙鐢ㄤ簬鍥炴粴锛?
      const originalIndexByBlockID = new Map(this.indexByBlockID);
      const originalIndexByXiuyuanID = new Map(this.indexByXiuyuanID);
      const originalIndexByType = new Map(this.indexByType);
      const originalIndexByPriority = new Map(this.indexByPriority);
      const originalIndexByDue = [...this.indexByDue];

      try {
        // 1. 淇濆瓨 XiuYuan锛堝鏋滀笉瀛樺湪锛?
        if (!xiuyuanExisted) {
          this.xiuyuans.set(xiuyuan.id, xiuyuan);
        }

        // 2. 鎵归噺淇濆瓨 Cards锛堣浆鎹负 DTO锛?
        for (const card of cards) {
          const dto = CardMapper.toPersistence(card);
          this.cardDTOs.set(dto.id, dto);
        }

        // 3. 涓€娆℃€ф洿鏂版墍鏈夌储寮?
        for (const card of cards) {
          this.updateIndexesForCard(card, 'add');
        }

        // 4. 閲嶆柊鎺掑簭 due 绱㈠紩锛堝彧鎺掑簭涓€娆★級
        this.indexByDue.sort((a, b) => a.due - b.due);

        // 5. 璋冨害淇濆瓨锛堝彧淇濆瓨涓€娆★級
        this.scheduleSave();

        return ok(undefined);
      } catch (error) {
        // 鍥炴粴鎵€鏈夋洿鏀?

        // 鍥炴粴 XiuYuan
        if (!xiuyuanExisted) {
          this.xiuyuans.delete(xiuyuan.id);
        } else if (originalXiuyuan) {
          this.xiuyuans.set(xiuyuan.id, originalXiuyuan);
        }

        // 鍥炴粴 Cards
        for (const card of cards) {
          this.cardDTOs.delete(card.id);
        }

        // 鍥炴粴绱㈠紩
        this.indexByBlockID = originalIndexByBlockID;
        this.indexByXiuyuanID = originalIndexByXiuyuanID;
        this.indexByType = originalIndexByType;
        this.indexByPriority = originalIndexByPriority;
        this.indexByDue = originalIndexByDue;

        return err(error instanceof Error ? error : new Error(String(error)));
      }
    }

    // === DTO CRUD 鎿嶄綔 ===

    /**
     * 鍒涘缓鍗＄墖锛堜娇鐢?DTO锛?
     * @param xiuyuan XiuYuan 瀹炰綋
     * @param dto CardPersistenceDTO
     */
    async createCardDTO(xiuyuan: IXiuyuan, dto: CardPersistenceDTO): Promise<Result<void>> {
      try {
        // 淇濆瓨 XiuYuan锛堝鏋滀笉瀛樺湪锛?
        if (!this.xiuyuans.has(xiuyuan.id)) {
          this.xiuyuans.set(xiuyuan.id, xiuyuan);
        }

        // 淇濆瓨 DTO
        this.cardDTOs.set(dto.id, dto);

        // 鏇存柊绱㈠紩锛堜娇鐢?DTO 鐨勯《灞傚瓧娈碉級
        this.updateIndexesForDTO(dto, 'add');

        // 閲嶆柊鎺掑簭 due 绱㈠紩浠ヤ繚鎸佷竴鑷存€?
        this.indexByDue.sort((a, b) => a.due - b.due);

        // 璋冨害淇濆瓨
        this.scheduleSave();

        return ok(undefined);
      } catch (error) {
        return err(error instanceof Error ? error : new Error(String(error)));
      }
    }

    /**
     * 鑾峰彇鍗＄墖 DTO
     * @param cardId 鍗＄墖 ID
     */
    getCardDTO(cardId: string): CardPersistenceDTO | undefined {
      return this.cardDTOs.get(cardId);
    }

    /**
     * 鏇存柊鍗＄墖锛堜娇鐢?DTO锛?
     * @param dto 鏇存柊鍚庣殑 DTO
     */
    async updateCardDTO(dto: CardPersistenceDTO): Promise<Result<void>> {
      try {
        // 鉁?闃插尽鎬ф鏌ワ細纭繚 cardDTOs Map 宸插垵濮嬪寲
        if (!this.cardDTOs) {
          console.error('[UnifiedStorageManager] 鉂?CRITICAL: cardDTOs Map is undefined!');
          return err(new Error('Storage not initialized: cardDTOs Map is undefined'));
        }

        const oldDTO = this.cardDTOs.get(dto.id);
        if (!oldDTO) {
          return err(new Error(`Card not found: ${dto.id}`));
        }

        console.log('[UnifiedStorageManager] updateCardDTO - Before update:', {
          cardId: dto.id,
          oldPriority: oldDTO.priority,
          newPriority: dto.priority,
          oldDTOKeys: Object.keys(oldDTO).length,
          newDTOKeys: Object.keys(dto).length,
          cardDTOsType: typeof this.cardDTOs,
          cardDTOsSize: this.cardDTOs?.size,
        });

        // 绉婚櫎鏃х储寮?
        this.updateIndexesForDTO(oldDTO, 'remove');

        // 鏇存柊 DTO
        this.cardDTOs.set(dto.id, dto);

        console.log('[UnifiedStorageManager] updateCardDTO - After update:', {
          cardId: dto.id,
          newPriority: dto.priority,
          cardDTOsSize: this.cardDTOs.size,
        });

        // 娣诲姞鏂扮储寮?
        this.updateIndexesForDTO(dto, 'add');

        // 閲嶆柊鎺掑簭 due 绱㈠紩
        this.indexByDue.sort((a, b) => a.due - b.due);

        // 璋冨害淇濆瓨
        this.scheduleSave();

        return ok(undefined);
      } catch (error) {
        return err(error instanceof Error ? error : new Error(String(error)));
      }
    }

    /**
     * 鎵归噺鍒涘缓鍗＄墖锛堜娇鐢?DTO锛屽師瀛愭€ф搷浣滐級
     * @param xiuyuan XiuYuan 瀹炰綋
     * @param dtos CardPersistenceDTO 鏁扮粍
     */
    async batchCreateCardsDTO(xiuyuan: IXiuyuan, dtos: CardPersistenceDTO[]): Promise<Result<void>> {
      // 楠岃瘉杈撳叆
      if (!xiuyuan || !xiuyuan.id) {
        return err(new Error('Invalid xiuyuan: missing id'));
      }
      if (!dtos || dtos.length === 0) {
        return err(new Error('Invalid dtos: empty array'));
      }

      // 楠岃瘉鎵€鏈?DTO
      for (const dto of dtos) {
        if (!dto.id) {
          return err(new Error('Invalid dto: missing id'));
        }
        if (dto.xiuyuanID && dto.xiuyuanID !== xiuyuan.id) {
          return err(new Error(`DTO ${dto.id} xiuyuanID mismatch: expected ${xiuyuan.id}, got ${dto.xiuyuanID}`));
        }
        if (this.cardDTOs.has(dto.id)) {
          return err(new Error(`Card ${dto.id} already exists`));
        }
      }

      // 淇濆瓨鍘熷鐘舵€佺敤浜庡洖婊?
      const xiuyuanExisted = this.xiuyuans.has(xiuyuan.id);
      const originalXiuyuan = xiuyuanExisted ? this.xiuyuans.get(xiuyuan.id) : undefined;

      // 淇濆瓨鍘熷绱㈠紩鐘舵€侊紙鐢ㄤ簬鍥炴粴锛?
      const originalIndexByBlockID = new Map(this.indexByBlockID);
      const originalIndexByXiuyuanID = new Map(this.indexByXiuyuanID);
      const originalIndexByType = new Map(this.indexByType);
      const originalIndexByPriority = new Map(this.indexByPriority);
      const originalIndexByDue = [...this.indexByDue];

      try {
        // 1. 淇濆瓨 XiuYuan锛堝鏋滀笉瀛樺湪锛?
        if (!xiuyuanExisted) {
          this.xiuyuans.set(xiuyuan.id, xiuyuan);
        }

        // 2. 鎵归噺淇濆瓨 DTOs
        for (const dto of dtos) {
          this.cardDTOs.set(dto.id, dto);
        }

        // 3. 涓€娆℃€ф洿鏂版墍鏈夌储寮?
        for (const dto of dtos) {
          this.updateIndexesForDTO(dto, 'add');
        }

        // 4. 閲嶆柊鎺掑簭 due 绱㈠紩锛堝彧鎺掑簭涓€娆★級
        this.indexByDue.sort((a, b) => a.due - b.due);

        // 5. 璋冨害淇濆瓨锛堝彧淇濆瓨涓€娆★級
        this.scheduleSave();

        return ok(undefined);
      } catch (error) {
        // 鍥炴粴鎵€鏈夋洿鏀?

        // 鍥炴粴 XiuYuan
        if (!xiuyuanExisted) {
          this.xiuyuans.delete(xiuyuan.id);
        } else if (originalXiuyuan) {
          this.xiuyuans.set(xiuyuan.id, originalXiuyuan);
        }

        // 鍥炴粴 DTOs
        for (const dto of dtos) {
          this.cardDTOs.delete(dto.id);
        }

        // 鍥炴粴绱㈠紩
        this.indexByBlockID = originalIndexByBlockID;
        this.indexByXiuyuanID = originalIndexByXiuyuanID;
        this.indexByType = originalIndexByType;
        this.indexByPriority = originalIndexByPriority;
        this.indexByDue = originalIndexByDue;

        return err(error instanceof Error ? error : new Error(String(error)));
      }
    }

    /**
     * 鏇存柊绱㈠紩锛堜娇鐢?DTO 鐨勯《灞傚瓧娈碉級
     * @param dto CardPersistenceDTO
     * @param action 鎿嶄綔绫诲瀷锛坅dd 鎴?remove锛?
     */
    private updateIndexesForDTO(dto: CardPersistenceDTO, action: 'add' | 'remove'): void {
      if (action === 'add') {
        // blockID 绱㈠紩
        const blockCards = this.indexByBlockID.get(dto.blockId) || [];
        if (!blockCards.includes(dto.id)) {
          blockCards.push(dto.id);
          this.indexByBlockID.set(dto.blockId, blockCards);
        }

        // xiuyuanID 绱㈠紩锛堜娇鐢ㄩ《灞傚瓧娈碉紝閬垮厤瑙ｆ瀽 meta锛?
        if (dto.xiuyuanID) {
          const xiuyuanCards = this.indexByXiuyuanID.get(dto.xiuyuanID) || [];
          if (!xiuyuanCards.includes(dto.id)) {
            xiuyuanCards.push(dto.id);
            this.indexByXiuyuanID.set(dto.xiuyuanID, xiuyuanCards);
          }
        }

        // type 绱㈠紩
        const typeCards = this.indexByType.get(dto.type) || [];
        if (!typeCards.includes(dto.id)) {
          typeCards.push(dto.id);
          this.indexByType.set(dto.type, typeCards);
        }

        // priority 绱㈠紩
        const priorityCards = this.indexByPriority.get(dto.priority) || [];
        if (!priorityCards.includes(dto.id)) {
          priorityCards.push(dto.id);
          this.indexByPriority.set(dto.priority, priorityCards);
        }

        // due 绱㈠紩锛堜娇鐢?FSRSCard锛屽洜涓?indexByDue 瀛樺偍鐨勬槸 FSRSCard锛?
        const fsrsCard = CardMapper.toDomain(dto);
        this.indexByDue.push(fsrsCard);
      } else {
        // 绉婚櫎 blockID 绱㈠紩
        const blockCards = this.indexByBlockID.get(dto.blockId);
        if (blockCards) {
          const index = blockCards.indexOf(dto.id);
          if (index !== -1) {
            blockCards.splice(index, 1);
          }
          if (blockCards.length === 0) {
            this.indexByBlockID.delete(dto.blockId);
          }
        }

        // 绉婚櫎 xiuyuanID 绱㈠紩
        if (dto.xiuyuanID) {
          const xiuyuanCards = this.indexByXiuyuanID.get(dto.xiuyuanID);
          if (xiuyuanCards) {
            const index = xiuyuanCards.indexOf(dto.id);
            if (index !== -1) {
              xiuyuanCards.splice(index, 1);
            }
            if (xiuyuanCards.length === 0) {
              this.indexByXiuyuanID.delete(dto.xiuyuanID);
            }
          }
        }

        // 绉婚櫎 type 绱㈠紩
        const typeCards = this.indexByType.get(dto.type);
        if (typeCards) {
          const index = typeCards.indexOf(dto.id);
          if (index !== -1) {
            typeCards.splice(index, 1);
          }
          if (typeCards.length === 0) {
            this.indexByType.delete(dto.type);
          }
        }

        // 绉婚櫎 priority 绱㈠紩
        const priorityCards = this.indexByPriority.get(dto.priority);
        if (priorityCards) {
          const index = priorityCards.indexOf(dto.id);
          if (index !== -1) {
            priorityCards.splice(index, 1);
          }
          if (priorityCards.length === 0) {
            this.indexByPriority.delete(dto.priority);
          }
        }

        // 绉婚櫎 due 绱㈠紩
        const dueIndex = this.indexByDue.findIndex(c => c.id === dto.id);
        if (dueIndex !== -1) {
          this.indexByDue.splice(dueIndex, 1);
        }
      }
    }



  /**
   * 鑾峰彇鍗＄墖
   * @param cardId 鍗＄墖 ID
   */
  getCard(cardId: string): FSRSCard | undefined {
    const dto = this.cardDTOs.get(cardId);
    if (!dto) return undefined;
    return CardMapper.toDomain(dto);  // 鉁?鍔ㄦ€佽浆鎹?
  }

  /**
   * 鏇存柊鍗＄墖
   * @param card 鏇存柊鍚庣殑鍗＄墖
   */
  async updateCard(card: FSRSCard): Promise<Result<void>> {
    try {
      // 杞崲 FSRSCard 涓?DTO
      const dto = CardMapper.toPersistence(card);
      
      // 璋冪敤 DTO 鏂规硶锛堜繚鎸佸悜鍚庡吋瀹癸級
      return await this.updateCardDTO(dto);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * 鍒犻櫎鍗＄墖
   * @param cardId 鍗＄墖 ID
   */
  async deleteCard(cardId: string): Promise<Result<void>> {
    try {
      const dto = this.cardDTOs.get(cardId);
      if (!dto) {
        return err(new Error(`Card not found: ${cardId}`));
      }

      const card = CardMapper.toDomain(dto);

      // 绉婚櫎绱㈠紩
      this.updateIndexesForCard(card, 'remove');

      // 鍒犻櫎鍗＄墖
      this.cardDTOs.delete(cardId);

      // 妫€鏌ユ槸鍚﹂渶瑕佸垹闄?XiuYuan
      const xiuyuanID = card.meta?.xiuyuanID;
      if (xiuyuanID) {
        const xiuyuanCards = this.indexByXiuyuanID.get(xiuyuanID);
        if (!xiuyuanCards || xiuyuanCards.length === 0) {
          // 娌℃湁鍏朵粬鍗＄墖寮曠敤姝?XiuYuan锛屽垹闄ゅ畠
          this.xiuyuans.delete(xiuyuanID);
        }
      }

      // 璋冨害淇濆瓨
      this.scheduleSave();

      return ok(undefined);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * 鍒犻櫎 XiuYuan锛堢骇鑱斿垹闄ゆ墍鏈夊叧鑱斿崱鐗囷級
   * @param xiuyuanId XiuYuan ID
   */
  async deleteXiuYuan(xiuyuanId: string): Promise<Result<void>> {
    try {
      const xiuyuan = this.xiuyuans.get(xiuyuanId);
      if (!xiuyuan) {
        return err(new Error(`XiuYuan not found: ${xiuyuanId}`));
      }

      // 鑾峰彇鎵€鏈夊叧鑱斿崱鐗?
      const cardIds = this.indexByXiuyuanID.get(xiuyuanId) || [];

      // 鍒犻櫎鎵€鏈夊叧鑱斿崱鐗?
      for (const cardId of [...cardIds]) {
        const dto = this.cardDTOs.get(cardId);
        if (dto) {
          const card = CardMapper.toDomain(dto);
          this.updateIndexesForCard(card, 'remove');
          this.cardDTOs.delete(cardId);
        }
      }

      // 鍒犻櫎 XiuYuan
      this.xiuyuans.delete(xiuyuanId);

      // 璋冨害淇濆瓨
      this.scheduleSave();

      return ok(undefined);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  // === 鏌ヨ鏂规硶 ===

  /**
   * 鑾峰彇鍒版湡鍗＄墖
   * @param limit 闄愬埗鏁伴噺
   */
  getDueCards(limit: number): FSRSCard[] {
    const now = Date.now();
    const dueCards: FSRSCard[] = [];

    for (const card of this.indexByDue) {
      if (card.due <= now && card.state !== 4) {
        dueCards.push(card);
        if (dueCards.length >= limit) {
          break;
        }
      }
    }

    return dueCards;
  }

  /**
   * 鏍规嵁鍧?ID 鑾峰彇鍗＄墖
   * @param blockId 鍧?ID
   */
  getCardsByBlockId(blockId: string): FSRSCard[] {
    const cardIds = this.indexByBlockID.get(blockId) || [];
    return cardIds
      .map(id => this.cardDTOs.get(id))
      .filter((dto): dto is CardPersistenceDTO => dto !== undefined)
      .map(dto => CardMapper.toDomain(dto));  // 鉁?鍔ㄦ€佽浆鎹?
  }

  /**
   * 鏍规嵁 XiuYuan ID 鑾峰彇鍗＄墖
   * @param xiuyuanId XiuYuan ID
   */
  getCardsByXiuyuanId(xiuyuanId: string): FSRSCard[] {
    const cardIds = this.indexByXiuyuanID.get(xiuyuanId) || [];
    return cardIds
      .map(id => this.cardDTOs.get(id))
      .filter((dto): dto is CardPersistenceDTO => dto !== undefined)
      .map(dto => CardMapper.toDomain(dto));  // 鉁?鍔ㄦ€佽浆鎹?
  }

  /**
   * 鏍规嵁绫诲瀷鑾峰彇鍗＄墖
   * @param type 鍗＄墖绫诲瀷
   */
  getCardsByType(type: CardType): FSRSCard[] {
    const cardIds = this.indexByType.get(type) || [];
    return cardIds
      .map(id => this.cardDTOs.get(id))
      .filter((dto): dto is CardPersistenceDTO => dto !== undefined)
      .map(dto => CardMapper.toDomain(dto));  // 鉁?鍔ㄦ€佽浆鎹?
  }

  /**
   * 鑾峰彇鎵€鏈夊崱鐗?
   */
  getAllCards(): FSRSCard[] {
    return Array.from(this.cardDTOs.values()).map(dto => CardMapper.toDomain(dto));  // 鉁?鍔ㄦ€佽浆鎹?
  }

  /**
   * 鑾峰彇 XiuYuan
   * @param xiuyuanId XiuYuan ID
   */
  getXiuYuan(xiuyuanId: string): IXiuyuan | undefined {
    return this.xiuyuans.get(xiuyuanId);
  }

  /**
   * Upsert a Xiuyuan aggregate snapshot in memory.
   *
   * Note: this keeps previous behavior of immediate in-memory update only.
   * Callers control persistence timing via existing save flows.
   */
  upsertXiuYuan(xiuyuan: IXiuyuan): void {
    this.xiuyuans.set(xiuyuan.id, xiuyuan);
  }

  /**
   * 鑾峰彇鎵€鏈?XiuYuans
   */
  getAllXiuYuans(): IXiuyuan[] {
    return Array.from(this.xiuyuans.values());
  }

  // === 鏁版嵁涓€鑷存€?===

  /**
   * 楠岃瘉鏁版嵁涓€鑷存€?
   * @returns 闂鍒楄〃
   */
  async validateConsistency(): Promise<string[]> {
    const issues: string[] = [];

    // 妫€鏌ュ鍎垮崱鐗囷紙娌℃湁 xiuyuanID 鎴?xiuyuanID 鏃犳晥锛?
    for (const dto of this.cardDTOs.values()) {
      const card = CardMapper.toDomain(dto);
      const xiuyuanID = card.meta?.xiuyuanID;
      if (!xiuyuanID) {
        issues.push(`Card ${card.id} has no xiuyuanID`);
      } else if (!this.xiuyuans.has(xiuyuanID)) {
        issues.push(`Card ${card.id} references non-existent XiuYuan ${xiuyuanID}`);
      }
    }

    // 妫€鏌ョ┖ XiuYuan锛堟病鏈夊叧鑱斿崱鐗囷級
    for (const xiuyuan of this.xiuyuans.values()) {
      const cardIds = this.indexByXiuyuanID.get(xiuyuan.id);
      if (!cardIds || cardIds.length === 0) {
        issues.push(`XiuYuan ${xiuyuan.id} has no associated cards`);
      }
    }

    return issues;
  }

  /**
   * 鑷姩淇鏁版嵁涓€鑷存€ч棶棰?
   * @returns 淇鐨勯棶棰樻暟閲?
   */
  async autoFix(): Promise<number> {
    let fixedCount = 0;

    // 鍒犻櫎瀛ゅ効鍗＄墖
    const orphanCards: string[] = [];
    for (const dto of this.cardDTOs.values()) {
      const card = CardMapper.toDomain(dto);
      const xiuyuanID = card.meta?.xiuyuanID;
      if (!xiuyuanID || !this.xiuyuans.has(xiuyuanID)) {
        orphanCards.push(card.id);
      }
    }

    for (const cardId of orphanCards) {
      const dto = this.cardDTOs.get(cardId);
      if (dto) {
        const card = CardMapper.toDomain(dto);
        this.updateIndexesForCard(card, 'remove');
        this.cardDTOs.delete(cardId);
        fixedCount++;
      }
    }

    // 鍒犻櫎绌?XiuYuan
    const emptyXiuYuans: string[] = [];
    for (const xiuyuan of this.xiuyuans.values()) {
      const cardIds = this.indexByXiuyuanID.get(xiuyuan.id);
      if (!cardIds || cardIds.length === 0) {
        emptyXiuYuans.push(xiuyuan.id);
      }
    }

    for (const xiuyuanId of emptyXiuYuans) {
      this.xiuyuans.delete(xiuyuanId);
      fixedCount++;
    }

    if (fixedCount > 0) {
      this.scheduleSave();
    }

    return fixedCount;
  }

  /**
   * 鑾峰彇缁熻淇℃伅
   */
  getStats(): StorageStats {
    const stats: StorageStats = {
      totalCards: this.cardDTOs.size,
      totalXiuYuans: this.xiuyuans.size,
      cardsByType: {} as Record<CardType, number>,
      dueCards: 0,
      newCards: 0,
      learningCards: 0,
      reviewCards: 0,
    };

    const now = Date.now();

    for (const dto of this.cardDTOs.values()) {
      const card = CardMapper.toDomain(dto);
      // 鎸夌被鍨嬬粺璁?
      stats.cardsByType[card.type] = (stats.cardsByType[card.type] || 0) + 1;

      // 鎸夌姸鎬佺粺璁?
      if (card.state === 0) {
        stats.newCards++;
      } else if (card.state === 1 || card.state === 3) {
        stats.learningCards++;
      } else if (card.state === 2) {
        stats.reviewCards++;
      }

      // 鍒版湡鍗＄墖缁熻
      if (card.due <= now && card.state !== 4) {
        stats.dueCards++;
      }
    }

    return stats;
  }

  addToRiffBlacklist(blockID: string): void {
    this.riffBlacklist.add(blockID);
    this.scheduleSave();
  }

  removeFromRiffBlacklist(blockID: string): void {
    if (!this.riffBlacklist.has(blockID)) {
      return;
    }

    this.riffBlacklist.delete(blockID);
    this.scheduleSave();
  }

  isInRiffBlacklist(blockID: string): boolean {
    return this.riffBlacklist.has(blockID);
  }

  getRiffBlacklist(): Set<string> {
    return new Set(this.riffBlacklist);
  }

  async clearRiffBlacklist(): Promise<void> {
    if (this.riffBlacklist.size === 0) {
      return;
    }

    this.riffBlacklist.clear();
    const result = await this.save();
    if (!result.ok) {
      throw result.error;
    }
  }

  // ========================================================================
  // StorageManager 鍏煎鎺ュ彛锛堥€傞厤鍣ㄦ柟娉曪級
  // ========================================================================

  /**
   * 璁剧疆鍗＄墖锛圫torageManager 鍏煎鏂规硶锛?
   * 鍐呴儴璋冪敤 updateCard 鎴?createCard
   * 
   * **DDD 鏋舵瀯瑕佹眰**锛氭墍鏈夊崱鐗囧繀椤诲睘浜?Xiuyuan 鑱氬悎鏍?
   * - 濡傛灉鍗＄墖娌℃湁 xiuyuanID锛屼細鎶涘嚭閿欒
   * - 濡傛灉 xiuyuan 涓嶅瓨鍦紝浼氭姏鍑洪敊璇?
   */
  setCard(card: FSRSCard): void {
    const existing = this.cardDTOs.get(card.id);
    if (existing) {
      // 鏇存柊鐜版湁鍗＄墖
      this.updateCard(card);
    } else {
      // 鍒涘缓鏂板崱鐗?- 蹇呴』鏈?xiuyuanID
      const xiuyuanId =
        typeof card.meta === 'object' && card.meta !== null
          ? (card.meta as { xiuyuanID?: string }).xiuyuanID
          : undefined;
      if (!xiuyuanId) {
        throw new Error(`[UnifiedStorageManager] Cannot create card without xiuyuanID: ${card.id}. All cards must belong to a Xiuyuan aggregate.`);
      }
      
      const xiuyuan = this.xiuyuans.get(xiuyuanId);
      if (!xiuyuan) {
        throw new Error(`[UnifiedStorageManager] Xiuyuan not found: ${xiuyuanId}. Cannot create card ${card.id}.`);
      }
      
      this.createCard(xiuyuan, card);
    }
  }

  /**
   * 绉婚櫎鍗＄墖锛圫torageManager 鍏煎鏂规硶锛?
   * 鍐呴儴璋冪敤 deleteCard锛堝悓姝ョ増鏈級
   */
  removeCard(cardId: string): boolean {
    const dto = this.cardDTOs.get(cardId);
    if (!dto) {
      return false;
    }

    const card = CardMapper.toDomain(dto);

    // 浠?Map 涓垹闄?
    this.cardDTOs.delete(cardId);

    // 鏇存柊绱㈠紩
    this.updateIndexesForCard(card, 'remove');

    // 鏍囪涓鸿剰
    this.dirty = true;
    this.scheduleSave();

    return true;
  }

  /**
   * 淇濆瓨鍗＄墖锛圫torageManager 鍏煎鏂规硶锛?
   * 鍐呴儴璋冪敤 save
   */
  async saveCards(): Promise<void> {
    const result = await this.save();
    if (!result.ok) {
      const errorMsg = result.error?.message ?? 'Failed to save cards';
      throw new Error(errorMsg);
    }
  }

  /**
   * 閫氳繃 blockId 鑾峰彇鍗＄墖锛圫torageManager 鍏煎鏂规硶锛?
   * 娉ㄦ剰锛氳繑鍥炵涓€涓尮閰嶇殑鍗＄墖
   */
  getCardByBlockId(blockId: string): FSRSCard | undefined {
    const cards = this.getCardsByBlockId(blockId);
    return cards[0];
  }

  // ========================================================================
  // StorageStats 鍏煎鎺ュ彛
  // ========================================================================

  /**
   * 鑾峰彇缁熻淇℃伅锛堟墿灞曠増鏈級
   */
  getStatsExtended(): StorageStats & {
    xiuyuanCount: number;
    cardCount: number;
    cardDTOCount: number;
  } {
    const baseStats = this.getStats();
    return {
      ...baseStats,
      xiuyuanCount: this.xiuyuans.size,
      cardCount: this.cardDTOs.size,
      cardDTOCount: this.cardDTOs.size,
    };
  }
}

