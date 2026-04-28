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

import { CardState, type FSRSCard, type CardType } from '../../types/card';
import type { StructuredCardQuery } from '../../types/card-query';
import type { IXiuyuan } from '../xiuyuan/types';
import type { Result } from '../../types/result';
import { ok, err, isErr } from '../../types/result';
import type { CardPersistenceDTO } from '../../infrastructure/persistence/dto/CardPersistenceDTO';
import { CardMapper } from '../../infrastructure/persistence/mappers/CardMapper';
import { repairFsrsReviewState } from '../scheduler/fsrsReviewStateRepair';
import { isFsrsReviewCardType, resolveEffectiveSchedulerTypeForCard } from '../scheduler/schedulerPolicy';
import {
  buildLogicalCardKey,
  buildLogicalXiuyuanKey,
  chooseCanonicalXiuyuan,
  mergeCardDTOsLocalFirst,
  mergeXiuyuanSnapshots,
  normalizeXiuyuanOwnership,
} from './stability/logicalKeys';
import { createLogger } from '@/utils/logger';
import { isCardDismissed } from '@/core/card/domain/services/dismissState';

const logger = createLogger('UnifiedStorageManager');

/**
 * 缁熶竴瀛樺偍鏁版嵁缁撴瀯
 */
export interface UnifiedCardStore {
  version: number;
  xiuyuans: Record<string, IXiuyuan>;
  cards: Record<string, FSRSCard>;
  cardDTOs?: Record<string, CardPersistenceDTO>;
  deletedCardDTOs?: Record<string, StorageDeletionTombstone>;
  deletedXiuyuans?: Record<string, StorageDeletionTombstone>;
  riffBlacklist?: string[];
  syncMetadata?: StorageSyncMetadata;
  riffSyncState?: RiffSyncState;
}

export type StorageConflictResolutionStrategy = 'merge' | 'prefer-local' | 'prefer-remote';

export interface StorageSyncMetadata {
  revision: number;
  contentHash: string;
  lastModifiedAt: number;
  lastModifiedBy: string;
}

export interface RiffSyncState {
  lastSuccessfulIncrementalCursor?: string;
  lastSuccessfulIncrementalAt?: number;
  lastSuccessfulFullAt?: number;
}

export interface StorageDeletionTombstone {
  deletedAt: number;
  deletedBy?: string;
}

export type RiffSyncStatePatch = Partial<RiffSyncState>;

export interface CardUpdateOptions {
  preferIncomingScheduling?: boolean;
  suppressAutosave?: boolean;
  suppressDueIndexSort?: boolean;
}
export type StorageLoadReason = 'startup-load' | 'pre-save-conflict-check' | 'unspecified';
type XiuyuanLookup = ReadonlyMap<string, IXiuyuan> | Record<string, IXiuyuan>;
type TombstoneLookup = ReadonlyMap<string, StorageDeletionTombstone> | Record<string, StorageDeletionTombstone>;

const STABLE_QUICK_META_STRING_KEYS = ['source', 'cardSource', 'symbolType', 'clozeRenderMode'] as const;
const STABLE_QUICK_META_BOOLEAN_KEYS = ['symbolDetected'] as const;
const CURRENT_UNIFIED_CARD_STORE_VERSION = 2;
const FNV1A_64_OFFSET_BASIS = 0xcbf29ce484222325n;
const FNV1A_64_PRIME = 0x100000001b3n;

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readFiniteNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return undefined;
}

function stableStringify(value: unknown): string {
  if (value === null) {
    return 'null';
  }

  const valueType = typeof value;
  if (valueType === 'number') {
    return Number.isFinite(value as number) ? JSON.stringify(value) : 'null';
  }
  if (valueType === 'boolean' || valueType === 'string') {
    return JSON.stringify(value);
  }
  if (valueType === 'undefined') {
    return 'null';
  }

  if (Array.isArray(value)) {
    return `[${value.map(item => stableStringify(item)).join(',')}]`;
  }

  if (valueType === 'object') {
    const record = value as Record<string, unknown>;
    const entries = Object.entries(record)
      .filter(([, entryValue]) => entryValue !== undefined)
      .sort(([left], [right]) => left.localeCompare(right));

    const body = entries
      .map(([key, entryValue]) => `${JSON.stringify(key)}:${stableStringify(entryValue)}`)
      .join(',');
    return `{${body}}`;
  }

  return 'null';
}

function fnv1aHash(input: string): string {
  let hash = FNV1A_64_OFFSET_BASIS;
  for (const character of input) {
    hash ^= BigInt(character.codePointAt(0) || 0);
    hash = BigInt.asUintN(64, hash * FNV1A_64_PRIME);
  }
  return hash.toString(16).padStart(16, '0');
}

function areStructurallyEqual(left: unknown, right: unknown): boolean {
  return stableStringify(left) === stableStringify(right);
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
  private deletedCardDTOs: Map<string, StorageDeletionTombstone> = new Map();
  private deletedXiuyuans: Map<string, StorageDeletionTombstone> = new Map();
  private riffBlacklist: Set<string> = new Set();
  private riffSyncState: RiffSyncState = {};

  // === 鍐呭瓨绱㈠紩 ===
  private indexByBlockID: Map<string, string[]> = new Map();
  private indexByXiuyuanID: Map<string, string[]> = new Map();
  private indexByType: Map<CardType, string[]> = new Map();
  private indexByState: Map<number, string[]> = new Map();
  private indexByDue: FSRSCard[] = [];
  private indexByPriority: Map<number, string[]> = new Map();

  // === 鑴忔爣璁板拰鑷姩淇濆瓨 ===
  private dirty: boolean = false;
  private saveTimer: NodeJS.Timeout | null = null;
  private readonly SAVE_DELAY = 1000; // 1 绉掑欢杩?

  // === 鎸佷箙鍖栧洖璋?===
  private saveCallback: ((data: UnifiedCardStore) => Promise<void>) | null = null;
  private loadCallback: ((reason?: StorageLoadReason) => Promise<UnifiedCardStore>) | null = null;
  private conflictResolutionStrategy: StorageConflictResolutionStrategy = 'merge';
  private readonly instanceId = `storage-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  private lastKnownContentHash: string | null = null;
  private lastKnownRevision: number = 0;
  private writeQueue: Promise<void> = Promise.resolve();
  private writeDepth = 0;

  async runWriteTransaction<T>(
    label: string,
    operation: () => Promise<T> | T
  ): Promise<T> {
    if (this.writeDepth > 0) {
      return await operation();
    }

    const previousQueue = this.writeQueue;
    let releaseQueue: (() => void) | undefined;
    this.writeQueue = new Promise<void>((resolve) => {
      releaseQueue = resolve;
    });

    await previousQueue;
    const startedAt = Date.now();
    this.writeDepth += 1;
    logger.debug('[UnifiedStorageManager] Local write transaction begin', { label });
    try {
      return await operation();
    } finally {
      this.writeDepth = Math.max(0, this.writeDepth - 1);
      releaseQueue?.();
      logger.debug('[UnifiedStorageManager] Local write transaction end', {
        label,
        durationMs: Date.now() - startedAt,
      });
    }
  }

  private async runWriteMutation<T>(
    label: string,
    operation: () => Promise<T> | T
  ): Promise<T> {
    return this.runWriteTransaction(label, operation);
  }

  private getXiuyuanFromLookup(
    xiuyuanId: string | undefined,
    xiuyuanLookup: XiuyuanLookup
  ): IXiuyuan | undefined {
    if (!xiuyuanId) {
      return undefined;
    }

    if (xiuyuanLookup instanceof Map) {
      return xiuyuanLookup.get(xiuyuanId);
    }

    return xiuyuanLookup[xiuyuanId];
  }

  private getXiuyuanEntries(lookup: XiuyuanLookup = this.xiuyuans): Array<[string, IXiuyuan]> {
    return lookup instanceof Map ? Array.from(lookup.entries()) : Object.entries(lookup);
  }

  private getCardDTOEntries(
    cardDTOs: Map<string, CardPersistenceDTO> | Record<string, CardPersistenceDTO> = this.cardDTOs,
  ): Array<[string, CardPersistenceDTO]> {
    return cardDTOs instanceof Map ? Array.from(cardDTOs.entries()) : Object.entries(cardDTOs);
  }

  private getDeletionTombstoneEntries(
    tombstones: Map<string, StorageDeletionTombstone> | Record<string, StorageDeletionTombstone>,
  ): Array<[string, StorageDeletionTombstone]> {
    return tombstones instanceof Map ? Array.from(tombstones.entries()) : Object.entries(tombstones);
  }

  private sanitizeDeletionTombstones(value: unknown): Record<string, StorageDeletionTombstone> {
    if (!isObjectRecord(value)) {
      return {};
    }

    const sanitized: Record<string, StorageDeletionTombstone> = {};
    for (const [id, rawTombstone] of Object.entries(value)) {
      if (!id.trim() || !isObjectRecord(rawTombstone)) {
        continue;
      }

      const deletedAt = readFiniteNumber(rawTombstone.deletedAt);
      if (!deletedAt || deletedAt <= 0) {
        continue;
      }

      sanitized[id] = {
        deletedAt,
        ...(typeof rawTombstone.deletedBy === 'string' && rawTombstone.deletedBy.trim().length > 0
          ? { deletedBy: rawTombstone.deletedBy.trim() }
          : {}),
      };
    }

    return sanitized;
  }

  private recordDeletionTombstone(
    tombstones: Map<string, StorageDeletionTombstone>,
    id: string,
    deletedAt: number = Date.now(),
  ): void {
    const normalizedId = String(id || '').trim();
    if (!normalizedId) {
      return;
    }

    const existing = tombstones.get(normalizedId);
    const nextDeletedAt = existing ? Math.max(existing.deletedAt, deletedAt) : deletedAt;
    tombstones.set(normalizedId, {
      deletedAt: nextDeletedAt,
      deletedBy: this.instanceId,
    });
  }

  private getDeletionTombstone(
    tombstones: Map<string, StorageDeletionTombstone>,
    id: string,
  ): StorageDeletionTombstone | undefined {
    const normalizedId = String(id || '').trim();
    if (!normalizedId) {
      return undefined;
    }

    return tombstones.get(normalizedId);
  }

  private wouldClearDeletionTombstone(
    tombstones: Map<string, StorageDeletionTombstone>,
    id: string,
    updatedAt: number | undefined,
  ): boolean {
    const existing = this.getDeletionTombstone(tombstones, id);
    return Boolean(existing && updatedAt && updatedAt > existing.deletedAt);
  }

  private isBlockedByDeletionTombstone(
    tombstones: Map<string, StorageDeletionTombstone>,
    id: string,
    updatedAt: number | undefined,
  ): boolean {
    const existing = this.getDeletionTombstone(tombstones, id);
    if (!existing) {
      return false;
    }

    return !updatedAt || updatedAt <= existing.deletedAt;
  }

  private clearDeletionTombstoneIfNewer(
    tombstones: Map<string, StorageDeletionTombstone>,
    id: string,
    updatedAt: number | undefined,
  ): boolean {
    const normalizedId = String(id || '').trim();
    if (!normalizedId) {
      return false;
    }

    const existing = tombstones.get(normalizedId);
    if (!existing || !updatedAt || updatedAt <= existing.deletedAt) {
      return false;
    }

    tombstones.delete(normalizedId);
    return true;
  }

  private clearCardDeletionTombstoneIfRecreated(dto: CardPersistenceDTO): boolean {
    return this.clearDeletionTombstoneIfNewer(
      this.deletedCardDTOs,
      dto.id,
      readFiniteNumber(dto.updatedAt),
    );
  }

  private clearXiuyuanDeletionTombstoneIfRecreated(xiuyuan: IXiuyuan): boolean {
    return this.clearDeletionTombstoneIfNewer(
      this.deletedXiuyuans,
      xiuyuan.id,
      readFiniteNumber(xiuyuan.updatedAt),
    );
  }

  private mergeDeletionTombstones(
    localTombstones: TombstoneLookup,
    remoteTombstones: TombstoneLookup,
  ): Record<string, StorageDeletionTombstone> {
    const merged: Record<string, StorageDeletionTombstone> = {};

    for (const [id, tombstone] of this.getDeletionTombstoneEntries(remoteTombstones)) {
      merged[id] = { ...tombstone };
    }

    for (const [id, tombstone] of this.getDeletionTombstoneEntries(localTombstones)) {
      const existing = merged[id];
      if (!existing || tombstone.deletedAt >= existing.deletedAt) {
        merged[id] = { ...tombstone };
      }
    }

    return merged;
  }

  private applyCardDeletionTombstones(
    cardDTOs: Record<string, CardPersistenceDTO>,
    tombstones: Record<string, StorageDeletionTombstone>,
  ): Record<string, StorageDeletionTombstone> {
    const activeTombstones: Record<string, StorageDeletionTombstone> = {};
    for (const [id, tombstone] of Object.entries(tombstones)) {
      const dto = cardDTOs[id];
      const updatedAt = dto ? readFiniteNumber(dto.updatedAt) : undefined;
      if (dto && updatedAt && updatedAt > tombstone.deletedAt) {
        continue;
      }
      activeTombstones[id] = tombstone;
      delete cardDTOs[id];
    }
    return activeTombstones;
  }

  private applyXiuyuanDeletionTombstones(
    xiuyuans: Record<string, IXiuyuan>,
    tombstones: Record<string, StorageDeletionTombstone>,
  ): Record<string, StorageDeletionTombstone> {
    const activeTombstones: Record<string, StorageDeletionTombstone> = {};
    for (const [id, tombstone] of Object.entries(tombstones)) {
      const xiuyuan = xiuyuans[id];
      const updatedAt = xiuyuan ? readFiniteNumber(xiuyuan.updatedAt) : undefined;
      if (xiuyuan && updatedAt && updatedAt > tombstone.deletedAt) {
        continue;
      }
      activeTombstones[id] = tombstone;
      delete xiuyuans[id];
    }
    return activeTombstones;
  }

  private applyXiuyuanDeletionToCardDTOs(
    cardDTOs: Record<string, CardPersistenceDTO>,
    xiuyuanTombstones: Record<string, StorageDeletionTombstone>,
    cardTombstones: Record<string, StorageDeletionTombstone>,
  ): Record<string, StorageDeletionTombstone> {
    const mergedCardTombstones: Record<string, StorageDeletionTombstone> = {
      ...cardTombstones,
    };

    for (const [cardId, dto] of Object.entries(cardDTOs)) {
      const xiuyuanId = typeof dto.xiuyuanID === 'string' ? dto.xiuyuanID.trim() : '';
      if (!xiuyuanId) {
        continue;
      }

      const xiuyuanTombstone = xiuyuanTombstones[xiuyuanId];
      if (!xiuyuanTombstone) {
        continue;
      }

      const updatedAt = readFiniteNumber(dto.updatedAt);
      if (updatedAt && updatedAt > xiuyuanTombstone.deletedAt) {
        continue;
      }

      const existingCardTombstone = mergedCardTombstones[cardId];
      if (!existingCardTombstone || xiuyuanTombstone.deletedAt >= existingCardTombstone.deletedAt) {
        mergedCardTombstones[cardId] = {
          deletedAt: xiuyuanTombstone.deletedAt,
          ...(xiuyuanTombstone.deletedBy ? { deletedBy: xiuyuanTombstone.deletedBy } : {}),
        };
      }

      delete cardDTOs[cardId];
    }

    return mergedCardTombstones;
  }

  private resolveCanonicalXiuyuanSnapshot(
    incomingXiuyuan: IXiuyuan,
    lookup: XiuyuanLookup = this.xiuyuans,
  ): IXiuyuan {
    const normalizedIncoming = normalizeXiuyuanOwnership(incomingXiuyuan);
    const logicalKey = buildLogicalXiuyuanKey(normalizedIncoming);
    const candidates = this.getXiuyuanEntries(lookup)
      .map(([, xiuyuan]) => xiuyuan)
      .filter((candidate) => buildLogicalXiuyuanKey(candidate) === logicalKey);

    if (candidates.length === 0) {
      return normalizedIncoming;
    }

    const canonical = chooseCanonicalXiuyuan([...candidates, normalizedIncoming]);
    if (canonical.id === normalizedIncoming.id) {
      return normalizedIncoming;
    }

    return mergeXiuyuanSnapshots(canonical, normalizedIncoming).value;
  }

  private findExistingCardDTOByLogicalKey(
    dto: CardPersistenceDTO,
    xiuyuan: IXiuyuan,
    options: {
      excludeId?: string;
      xiuyuanLookup?: XiuyuanLookup;
      cardDTOs?: Map<string, CardPersistenceDTO> | Record<string, CardPersistenceDTO>;
    } = {},
  ): { id: string; dto: CardPersistenceDTO; xiuyuan: IXiuyuan | undefined } | null {
    const xiuyuanLookup = options.xiuyuanLookup ?? this.xiuyuans;
    const excludeId = String(options.excludeId || '').trim();
    const targetLogicalKey = buildLogicalCardKey(dto, xiuyuan);

    for (const [candidateId, candidateDto] of this.getCardDTOEntries(options.cardDTOs ?? this.cardDTOs)) {
      if (excludeId && candidateId === excludeId) {
        continue;
      }

      const candidateXiuyuan = this.getXiuyuanFromLookup(candidateDto.xiuyuanID, xiuyuanLookup);
      const candidateLogicalKey = buildLogicalCardKey(candidateDto, candidateXiuyuan);
      if (candidateLogicalKey === targetLogicalKey) {
        return {
          id: candidateId,
          dto: candidateDto,
          xiuyuan: candidateXiuyuan,
        };
      }
    }

    return null;
  }

  private normalizeDomainCardScheduling(card: FSRSCard, now: number = Date.now()): FSRSCard {
    const effectiveSchedulerType = resolveEffectiveSchedulerTypeForCard(card);
    const schedulerType = isFsrsReviewCardType(card.type) ? 'fsrs-v6' : card.schedulerType;
    const schedulerNormalizedCard = schedulerType === card.schedulerType
      ? card
      : { ...card, schedulerType };

    const repaired = repairFsrsReviewState(schedulerNormalizedCard, {
      schedulerType: effectiveSchedulerType,
      now,
    });

    return repaired.card;
  }

  private normalizeSchedulingDTO(
    dto: CardPersistenceDTO,
    now: number = Date.now()
  ): { dto: CardPersistenceDTO; changed: boolean; reasons: string[] } {
    const domainCard = CardMapper.toDomain(dto);
    const normalizedCard = this.normalizeDomainCardScheduling(domainCard, now);
    const nextDto: CardPersistenceDTO = { ...dto };
    const reasons: string[] = [];

    if (nextDto.schedulerType !== normalizedCard.schedulerType) {
      nextDto.schedulerType = normalizedCard.schedulerType;
      reasons.push('schedulerType');
    }

    const scheduleFields: Array<keyof Pick<
      CardPersistenceDTO,
      'due' | 'stability' | 'difficulty' | 'lastReview' | 'elapsedDays' | 'scheduledDays' | 'learning_step'
    >> = ['due', 'stability', 'difficulty', 'lastReview', 'elapsedDays', 'scheduledDays', 'learning_step'];

    for (const field of scheduleFields) {
      if (nextDto[field] !== normalizedCard[field]) {
        (nextDto as Record<string, unknown>)[field] = normalizedCard[field];
        reasons.push(field);
      }
    }

    return {
      dto: nextDto,
      changed: reasons.length > 0,
      reasons: Array.from(new Set(reasons)),
    };
  }

  private toDomainCard(
    dto: CardPersistenceDTO,
    xiuyuanLookup: XiuyuanLookup = this.xiuyuans
  ): FSRSCard {
    const card = this.normalizeDomainCardScheduling(CardMapper.toDomain(dto));
    const xiuyuanId = dto.xiuyuanID || card.xiuyuanID;
    const xiuyuan = this.getXiuyuanFromLookup(xiuyuanId, xiuyuanLookup);
    const xiuyuanMeta = isObjectRecord(xiuyuan?.meta) ? xiuyuan.meta : undefined;

    if (!xiuyuanMeta) {
      return card;
    }

    const nextMeta = isObjectRecord(card.meta) ? { ...card.meta } : {};
    let hydrated = false;

    for (const key of STABLE_QUICK_META_STRING_KEYS) {
      if (nextMeta[key] === undefined && typeof xiuyuanMeta[key] === 'string') {
        nextMeta[key] = xiuyuanMeta[key];
        hydrated = true;
      }
    }

    for (const key of STABLE_QUICK_META_BOOLEAN_KEYS) {
      if (nextMeta[key] === undefined && typeof xiuyuanMeta[key] === 'boolean') {
        nextMeta[key] = xiuyuanMeta[key];
        hydrated = true;
      }
    }

    if (!hydrated) {
      return card;
    }

    return {
      ...card,
      meta: nextMeta,
    };
  }

  /**
   * 鉁?鏋勯€犲嚱鏁帮細纭繚鎵€鏈?Map 閮藉凡鍒濆鍖?
   */
  constructor() {
    // 闃插尽鎬ф鏌ワ細纭繚鎵€鏈?Map 閮藉凡鍒濆鍖?
    if (!this.cardDTOs) {
      logger.warn('[UnifiedStorageManager] cardDTOs not initialized in constructor, re-initializing...');
      this.cardDTOs = new Map();
    }
    if (!this.xiuyuans) {
      logger.warn('[UnifiedStorageManager] xiuyuans not initialized in constructor, re-initializing...');
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
    if (!this.indexByState) {
      this.indexByState = new Map();
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
    load: (reason?: StorageLoadReason) => Promise<UnifiedCardStore>
  ): void {
    this.saveCallback = save;
    this.loadCallback = load;
  }

  setConflictResolutionStrategy(strategy: StorageConflictResolutionStrategy): void {
    this.conflictResolutionStrategy = strategy;
    logger.info('[UnifiedStorageManager] conflict resolution strategy updated:', strategy);
  }

  getConflictResolutionStrategy(): StorageConflictResolutionStrategy {
    return this.conflictResolutionStrategy;
  }

  getRiffSyncState(): RiffSyncState {
    return { ...this.sanitizeRiffSyncState(this.riffSyncState) };
  }

  patchRiffSyncState(
    patch: RiffSyncStatePatch,
    options: {
      scheduleSave?: boolean;
    } = {},
  ): boolean {
    const nextState = this.sanitizeRiffSyncState({
      ...this.riffSyncState,
      ...patch,
    });
    if (areStructurallyEqual(this.riffSyncState, nextState)) {
      return false;
    }

    this.riffSyncState = nextState;

    if (options.scheduleSave === false) {
      this.dirty = true;
      return true;
    }

    this.scheduleSave('riff-sync-state-patch');
    return true;
  }

  async updateRiffSyncState(patch: RiffSyncStatePatch): Promise<Result<void>> {
    return this.runWriteMutation('riff-sync-state', async () => {
      if (!this.patchRiffSyncState(patch, { scheduleSave: false })) {
        return ok(undefined);
      }
      const saveResult = await this.save();
      if (isErr(saveResult)) {
        return saveResult;
      }
      return ok(undefined);
    });
  }

  isDirty(): boolean {
    return this.dirty;
  }

  /**
   * 鍔犺浇鏁版嵁
   */
  async load(): Promise<Result<void>> {
    try {
      if (!this.loadCallback) {
        return err(new Error('Load callback not set'));
      }

      const store = await this.loadCallback('startup-load');
      this.applyStoreSnapshot(store);
      return ok(undefined);

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
        logger.info('[UnifiedStorageManager] 鈿狅笍 Migrated old cards data to cardDTOs format');
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
  migrateLegacyFSRSV5SchedulerType(): number {
    let migratedCount = 0;

    for (const dto of this.cardDTOs.values()) {
      const schedulerType = (dto as { schedulerType?: unknown }).schedulerType;
      if (schedulerType === 'fsrs-v5') {
        (dto as { schedulerType?: string }).schedulerType = 'fsrs-v6';
        migratedCount++;
      }
    }

    if (migratedCount > 0) {
      this.dirty = true;
      logger.info(`[UnifiedStorageManager] Migrated ${migratedCount} legacy fsrs-v5 schedulerType values to fsrs-v6`);
    }

    return migratedCount;
  }

  normalizeMalformedReviewScheduling(now: number = Date.now()): number {
    let normalizedCount = 0;
    const reasonCounts = new Map<string, number>();
    const normalizedIds: string[] = [];

    for (const [id, dto] of this.cardDTOs.entries()) {
      const normalized = this.normalizeSchedulingDTO(dto, now);
      if (!normalized.changed) {
        continue;
      }

      this.cardDTOs.set(id, normalized.dto);
      normalizedCount++;
      if (normalizedIds.length < 10) {
        normalizedIds.push(id);
      }
      for (const reason of normalized.reasons) {
        reasonCounts.set(reason, (reasonCounts.get(reason) ?? 0) + 1);
      }
    }

    if (normalizedCount > 0) {
      this.rebuildIndexes();
      this.dirty = true;
      logger.info('[UnifiedStorageManager] Normalized malformed review scheduling', {
        normalizedCount,
        normalizedIdsSample: normalizedIds,
        reasons: Object.fromEntries(reasonCounts.entries()),
      });
    }

    return normalizedCount;
  }

  async save(): Promise<Result<void>> {
    return this.runWriteMutation('save', async () => {
      try {
        if (!this.saveCallback) {
          return err(new Error('Save callback not set'));
        }

        const localStore = this.getStoreData();
        const remoteStore = await this.loadRemoteSnapshotForSave();
        const { storeToPersist, skipPersist } = this.resolveConflictBeforeSave(localStore, remoteStore);

        if (!skipPersist) {
          const storeData = this.prepareStoreForPersist(storeToPersist, remoteStore);
          await this.saveCallback(storeData);
          this.applyStoreSnapshot(storeData);
        } else if (remoteStore) {
          this.applyStoreSnapshot(remoteStore);
        }

        this.dirty = false;
        this.clearSaveTimer();
        return ok(undefined);

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
    });
  }

  /**
   * 璋冨害淇濆瓨锛堥槻鎶栵級
   */
  private applyStoreSnapshot(store: UnifiedCardStore): void {
    const canonicalStore = this.prepareCanonicalStore(store);

    this.xiuyuans.clear();
    this.cardDTOs.clear();
    this.deletedCardDTOs.clear();
    this.deletedXiuyuans.clear();
    this.riffBlacklist.clear();
    this.riffSyncState = this.sanitizeRiffSyncState(canonicalStore.riffSyncState);

    for (const [id, xiuyuan] of Object.entries(canonicalStore.xiuyuans)) {
      this.xiuyuans.set(id, xiuyuan);
    }

    for (const [id, dto] of Object.entries(canonicalStore.cardDTOs || {})) {
      this.cardDTOs.set(id, dto);
    }

    for (const [id, tombstone] of Object.entries(canonicalStore.deletedCardDTOs || {})) {
      this.deletedCardDTOs.set(id, tombstone);
    }

    for (const [id, tombstone] of Object.entries(canonicalStore.deletedXiuyuans || {})) {
      this.deletedXiuyuans.set(id, tombstone);
    }

    for (const blockId of this.sanitizeRiffBlacklist(canonicalStore.riffBlacklist)) {
      this.riffBlacklist.add(blockId);
    }

    this.rebuildIndexes();
    this.dirty = false;
    this.captureSnapshotFromStore(canonicalStore);
  }

  private async loadRemoteSnapshotForSave(): Promise<UnifiedCardStore | null> {
    if (!this.loadCallback) {
      return null;
    }

    try {
      return await this.loadCallback('pre-save-conflict-check');
    } catch (error) {
      logger.error('[UnifiedStorageManager] Failed to load remote snapshot before save:', error);
      throw (error instanceof Error ? error : new Error(String(error)));
    }
  }

  private resolveConflictBeforeSave(
    localStore: UnifiedCardStore,
    remoteStore: UnifiedCardStore | null
  ): { storeToPersist: UnifiedCardStore; skipPersist: boolean } {
    if (!remoteStore) {
      return { storeToPersist: localStore, skipPersist: false };
    }

    const canonicalRemote = this.prepareCanonicalStore(remoteStore);
    const localHash = this.calculateContentHash(localStore);
    const remoteHash = this.calculateContentHash(canonicalRemote);

    if (localHash === remoteHash) {
      this.captureSnapshotFromStore(canonicalRemote);
      return { storeToPersist: canonicalRemote, skipPersist: true };
    }

    const hasConflict = this.lastKnownContentHash !== null && remoteHash !== this.lastKnownContentHash;
    if (!hasConflict) {
      return { storeToPersist: localStore, skipPersist: false };
    }

    logger.warn('[UnifiedStorageManager] Storage conflict detected', {
      strategy: this.conflictResolutionStrategy,
      lastKnownHash: this.lastKnownContentHash,
      remoteHash,
      localHash,
    });
    if (canonicalRemote.syncMetadata?.lastModifiedBy === this.instanceId) {
      logger.error('[UnifiedStorageManager] Abnormal local storage conflict fallback; merge is reserved for multi-window or external writer recovery, not the normal single-writer path', {
        strategy: this.conflictResolutionStrategy,
        lastKnownHash: this.lastKnownContentHash,
        remoteHash,
        localHash,
      });
    }

    if (this.conflictResolutionStrategy === 'prefer-remote') {
      this.applyStoreSnapshot(canonicalRemote);
      logger.warn('[UnifiedStorageManager] Conflict resolved with remote snapshot');
      return { storeToPersist: canonicalRemote, skipPersist: true };
    }

    if (this.conflictResolutionStrategy === 'prefer-local') {
      logger.warn('[UnifiedStorageManager] Conflict resolved by forcing local snapshot');
      return { storeToPersist: localStore, skipPersist: false };
    }

    const mergedStore = this.mergeStores(localStore, canonicalRemote);
    this.applyStoreSnapshot(mergedStore);
    logger.warn('[UnifiedStorageManager] Conflict resolved by merge');
    return { storeToPersist: mergedStore, skipPersist: false };
  }

  private prepareStoreForPersist(
    store: UnifiedCardStore,
    remoteStore: UnifiedCardStore | null
  ): UnifiedCardStore {
    const canonicalStore = this.prepareCanonicalStore(store);
    const remoteRevision = this.toNumber(remoteStore?.syncMetadata?.revision);
    const localRevision = this.toNumber(canonicalStore.syncMetadata?.revision);
    const baseRevision = Math.max(this.lastKnownRevision, remoteRevision, localRevision);
    const nextRevision = baseRevision + 1;
    const nextContentHash = this.calculateContentHash(canonicalStore);

    return {
      ...canonicalStore,
      syncMetadata: {
        revision: nextRevision,
        contentHash: nextContentHash,
        lastModifiedAt: Date.now(),
        lastModifiedBy: this.instanceId,
      },
    };
  }

  private mergeStores(localStore: UnifiedCardStore, remoteStore: UnifiedCardStore): UnifiedCardStore {
    const canonicalLocal = this.prepareCanonicalStore(localStore);
    const canonicalRemote = this.prepareCanonicalStore(remoteStore);
    const mergedDeletedXiuyuans = this.mergeDeletionTombstones(
      canonicalLocal.deletedXiuyuans || {},
      canonicalRemote.deletedXiuyuans || {},
    );

    const mergedXiuyuans: Record<string, IXiuyuan> = {
      ...canonicalRemote.xiuyuans,
    };
    for (const [id, localXiuyuan] of Object.entries(canonicalLocal.xiuyuans)) {
      const remoteXiuyuan = canonicalRemote.xiuyuans[id];
      mergedXiuyuans[id] = remoteXiuyuan
        ? this.chooseMostRecentXiuyuan(localXiuyuan, remoteXiuyuan)
        : JSON.parse(JSON.stringify(localXiuyuan)) as IXiuyuan;
    }
    const activeDeletedXiuyuans = this.applyXiuyuanDeletionTombstones(mergedXiuyuans, mergedDeletedXiuyuans);

    const mergedDeletedCardDTOsBase = this.mergeDeletionTombstones(
      canonicalLocal.deletedCardDTOs || {},
      canonicalRemote.deletedCardDTOs || {},
    );

    const mergedCardDTOs: Record<string, CardPersistenceDTO> = {
      ...(canonicalRemote.cardDTOs || {}),
    };
    const localCardDTOs = canonicalLocal.cardDTOs || {};
    for (const [id, localDto] of Object.entries(localCardDTOs)) {
      const remoteDto = mergedCardDTOs[id];
      mergedCardDTOs[id] = remoteDto
        ? this.chooseMostRecentCard(localDto, remoteDto)
        : JSON.parse(JSON.stringify(localDto)) as CardPersistenceDTO;
    }
    const mergedDeletedCardDTOsWithXiuyuanDeletes = this.applyXiuyuanDeletionToCardDTOs(
      mergedCardDTOs,
      activeDeletedXiuyuans,
      mergedDeletedCardDTOsBase,
    );
    const activeDeletedCardDTOs = this.applyCardDeletionTombstones(
      mergedCardDTOs,
      mergedDeletedCardDTOsWithXiuyuanDeletes,
    );

    const mergedBlacklist = Array.from(
      new Set([
        ...this.sanitizeRiffBlacklist(canonicalRemote.riffBlacklist),
        ...this.sanitizeRiffBlacklist(canonicalLocal.riffBlacklist),
      ])
    ).sort();

    const mergedCards: Record<string, FSRSCard> = {};
    for (const [id, dto] of Object.entries(mergedCardDTOs)) {
      mergedCards[id] = this.toDomainCard(dto, mergedXiuyuans);
    }

    return {
      version: Math.max(
        this.toNumber(canonicalLocal.version),
        this.toNumber(canonicalRemote.version),
        CURRENT_UNIFIED_CARD_STORE_VERSION,
      ),
      xiuyuans: mergedXiuyuans,
      cards: mergedCards,
      cardDTOs: mergedCardDTOs,
      deletedCardDTOs: activeDeletedCardDTOs,
      deletedXiuyuans: activeDeletedXiuyuans,
      riffBlacklist: mergedBlacklist,
      riffSyncState: this.chooseMostRecentRiffSyncState(
        this.sanitizeRiffSyncState(canonicalLocal.riffSyncState),
        this.sanitizeRiffSyncState(canonicalRemote.riffSyncState)
      ),
    };
  }

  private chooseMostRecentCard(
    localCard: CardPersistenceDTO,
    remoteCard: CardPersistenceDTO
  ): CardPersistenceDTO {
    return mergeCardDTOsLocalFirst(localCard, remoteCard, {
      canonicalXiuyuanId: String(localCard.xiuyuanID || remoteCard.xiuyuanID || '').trim() || undefined,
    }).value;
  }

  private chooseMostRecentXiuyuan(localXiuyuan: IXiuyuan, remoteXiuyuan: IXiuyuan): IXiuyuan {
    const preferred = chooseCanonicalXiuyuan([localXiuyuan, remoteXiuyuan]);
    const incoming = preferred === localXiuyuan ? remoteXiuyuan : localXiuyuan;
    return mergeXiuyuanSnapshots(preferred, incoming).value;
  }

  private normalizeDuplicateXiuyuans(
    cardDTOs: Record<string, CardPersistenceDTO>,
    xiuyuans: Record<string, IXiuyuan>,
  ): { mergedXiuyuanIds: string[]; duplicateGroupCount: number } {
    const groups = new Map<string, IXiuyuan[]>();
    for (const xiuyuan of Object.values(xiuyuans)) {
      const logicalKey = buildLogicalXiuyuanKey(xiuyuan);
      const group = groups.get(logicalKey) ?? [];
      group.push(xiuyuan);
      groups.set(logicalKey, group);
    }

    const mergedXiuyuanIds: string[] = [];
    let duplicateGroupCount = 0;

    for (const group of groups.values()) {
      if (group.length <= 1) {
        continue;
      }

      duplicateGroupCount += 1;
      const canonicalXiuyuan = chooseCanonicalXiuyuan(group);
      let mergedCanonical = canonicalXiuyuan;

      for (const candidate of group) {
        if (candidate.id === canonicalXiuyuan.id) {
          continue;
        }

        mergedCanonical = mergeXiuyuanSnapshots(mergedCanonical, candidate).value;
        for (const dto of Object.values(cardDTOs)) {
          if (dto.xiuyuanID === candidate.id) {
            dto.xiuyuanID = canonicalXiuyuan.id;
          }
        }

        delete xiuyuans[candidate.id];
        mergedXiuyuanIds.push(candidate.id);
      }

      xiuyuans[canonicalXiuyuan.id] = mergedCanonical;
    }

    return {
      mergedXiuyuanIds,
      duplicateGroupCount,
    };
  }

  private normalizeXiuyuanDuplicateCards(
    cardDTOs: Record<string, CardPersistenceDTO>,
    xiuyuans: Record<string, IXiuyuan>
  ): { removedCardIds: string[]; duplicateGroupCount: number } {
    const duplicateGroups = new Map<string, Array<{ id: string; dto: CardPersistenceDTO }>>();

    for (const [id, dto] of Object.entries(cardDTOs)) {
      const xiuyuanId = typeof dto.xiuyuanID === 'string' ? dto.xiuyuanID.trim() : '';
      const faceIndex = readFiniteNumber(dto.meta?.faceIndex) ?? readFiniteNumber(dto.meta?.ruleIndex);
      if (!xiuyuanId || faceIndex === undefined) {
        continue;
      }

      const groupKey = `${xiuyuanId}::${faceIndex}`;
      const group = duplicateGroups.get(groupKey) ?? [];
      group.push({ id, dto });
      duplicateGroups.set(groupKey, group);
    }

    const removedCardIds: string[] = [];
    const affectedXiuyuanIds = new Set<string>();
    let duplicateGroupCount = 0;

    for (const [groupKey, group] of duplicateGroups.entries()) {
      if (group.length <= 1) {
        continue;
      }

      duplicateGroupCount += 1;
      const [xiuyuanId, faceIndexRaw] = groupKey.split('::');
      const faceIndex = Number(faceIndexRaw);
      const deterministicId = `card_${xiuyuanId}_${faceIndex}`;
      const keepCandidate = group.find((candidate) => candidate.id === deterministicId)
        ?? group.reduce((best, current) => {
          const bestUpdatedAt = this.toNumber(best.dto.updatedAt);
          const currentUpdatedAt = this.toNumber(current.dto.updatedAt);
          if (currentUpdatedAt > bestUpdatedAt) {
            return current;
          }
          if (currentUpdatedAt < bestUpdatedAt) {
            return best;
          }

          const bestCreatedAt = this.toNumber(best.dto.createdAt);
          const currentCreatedAt = this.toNumber(current.dto.createdAt);
          return currentCreatedAt >= bestCreatedAt ? current : best;
        });

      for (const candidate of group) {
        if (candidate.id === keepCandidate.id) {
          continue;
        }
        delete cardDTOs[candidate.id];
        removedCardIds.push(candidate.id);
        affectedXiuyuanIds.add(xiuyuanId);
      }
    }

    for (const xiuyuanId of affectedXiuyuanIds) {
      const xiuyuan = xiuyuans[xiuyuanId];
      if (!xiuyuan || !isObjectRecord(xiuyuan.meta) || !Array.isArray(xiuyuan.meta.cardIds)) {
        continue;
      }

      const validCardIds = new Set(
        Object.entries(cardDTOs)
          .filter(([, dto]) => (typeof dto.xiuyuanID === 'string' ? dto.xiuyuanID.trim() : '') === xiuyuanId)
          .map(([cardId]) => cardId)
      );
      const dedupedCardIds = Array.from(new Set(
        xiuyuan.meta.cardIds.filter((cardId): cardId is string => typeof cardId === 'string' && validCardIds.has(cardId))
      ));

      xiuyuans[xiuyuanId] = {
        ...xiuyuan,
        meta: {
          ...xiuyuan.meta,
          cardIds: dedupedCardIds,
        },
      };
    }

    return {
      removedCardIds,
      duplicateGroupCount,
    };
  }

  private prepareCanonicalStore(store: UnifiedCardStore): UnifiedCardStore {
    const sourceXiuyuans = store.xiuyuans ?? {};
    const sourceCardDTOs = this.extractCardDTOs(store);
    const xiuyuans: Record<string, IXiuyuan> = {};
    const cardDTOs: Record<string, CardPersistenceDTO> = {};
    const deletedCardDTOs = this.sanitizeDeletionTombstones(store.deletedCardDTOs);
    const deletedXiuyuans = this.sanitizeDeletionTombstones(store.deletedXiuyuans);

    for (const [id, xiuyuan] of Object.entries(sourceXiuyuans)) {
      xiuyuans[id] = normalizeXiuyuanOwnership(JSON.parse(JSON.stringify(xiuyuan)) as IXiuyuan);
    }

    for (const [id, dto] of Object.entries(sourceCardDTOs)) {
      cardDTOs[id] = JSON.parse(JSON.stringify(dto)) as CardPersistenceDTO;
    }

    const xiuyuanNormalization = this.normalizeDuplicateXiuyuans(cardDTOs, xiuyuans);
    if (xiuyuanNormalization.mergedXiuyuanIds.length > 0) {
      logger.info('[UnifiedStorageManager] Normalized duplicate Xiuyuan block bindings', {
        duplicateGroupCount: xiuyuanNormalization.duplicateGroupCount,
        mergedXiuyuanCount: xiuyuanNormalization.mergedXiuyuanIds.length,
        mergedXiuyuanIdsSample: xiuyuanNormalization.mergedXiuyuanIds.slice(0, 10),
      });
    }

    const normalization = this.normalizeXiuyuanDuplicateCards(cardDTOs, xiuyuans);
    if (normalization.removedCardIds.length > 0) {
      logger.info('[UnifiedStorageManager] Normalized duplicate Xiuyuan logical cards', {
        duplicateGroupCount: normalization.duplicateGroupCount,
        removedCardCount: normalization.removedCardIds.length,
        removedCardIdsSample: normalization.removedCardIds.slice(0, 10),
      });
    }

    const activeDeletedXiuyuans = this.applyXiuyuanDeletionTombstones(xiuyuans, deletedXiuyuans);
    const deletedCardDTOsWithXiuyuanDeletes = this.applyXiuyuanDeletionToCardDTOs(
      cardDTOs,
      activeDeletedXiuyuans,
      deletedCardDTOs,
    );
    const activeDeletedCardDTOs = this.applyCardDeletionTombstones(
      cardDTOs,
      deletedCardDTOsWithXiuyuanDeletes,
    );

    const cards: Record<string, FSRSCard> = {};
    for (const [id, dto] of Object.entries(cardDTOs)) {
      cards[id] = this.toDomainCard(dto, xiuyuans);
    }

    const syncMetadata = store.syncMetadata
      ? {
          revision: Math.max(this.toNumber(store.syncMetadata.revision), 0),
          contentHash: typeof store.syncMetadata.contentHash === 'string' ? store.syncMetadata.contentHash : '',
          lastModifiedAt: this.toNumber(store.syncMetadata.lastModifiedAt),
          lastModifiedBy: typeof store.syncMetadata.lastModifiedBy === 'string'
            ? store.syncMetadata.lastModifiedBy
            : '',
        }
      : undefined;

    return {
      version: Math.max(this.toNumber(store.version), CURRENT_UNIFIED_CARD_STORE_VERSION),
      xiuyuans,
      cards,
      cardDTOs,
      deletedCardDTOs: activeDeletedCardDTOs,
      deletedXiuyuans: activeDeletedXiuyuans,
      riffBlacklist: this.sanitizeRiffBlacklist(store.riffBlacklist),
      riffSyncState: this.sanitizeRiffSyncState(store.riffSyncState),
      syncMetadata,
    };
  }

  private extractCardDTOs(store: UnifiedCardStore): Record<string, CardPersistenceDTO> {
    if (store.cardDTOs && Object.keys(store.cardDTOs).length > 0) {
      return store.cardDTOs;
    }

    const migrated: Record<string, CardPersistenceDTO> = {};
    for (const [id, card] of Object.entries(store.cards ?? {})) {
      migrated[id] = CardMapper.toPersistence(card);
    }

    if (Object.keys(migrated).length > 0) {
      logger.info('[UnifiedStorageManager] Migrated legacy cards payload to cardDTOs');
    }
    return migrated;
  }

  private sanitizeRiffBlacklist(rawBlacklist: unknown): string[] {
    if (!Array.isArray(rawBlacklist)) {
      return [];
    }

    return Array.from(
      new Set(
        rawBlacklist.filter((id): id is string => typeof id === 'string' && id.length > 0)
      )
    ).sort();
  }

  private calculateContentHash(store: UnifiedCardStore): string {
    const canonicalStore = this.prepareCanonicalStore(store);
    const hashInput = stableStringify({
      version: canonicalStore.version,
      xiuyuans: canonicalStore.xiuyuans,
      cardDTOs: canonicalStore.cardDTOs || {},
      deletedCardDTOs: canonicalStore.deletedCardDTOs || {},
      deletedXiuyuans: canonicalStore.deletedXiuyuans || {},
      riffBlacklist: canonicalStore.riffBlacklist || [],
      riffSyncState: canonicalStore.riffSyncState || {},
    });
    return fnv1aHash(hashInput);
  }

  private captureSnapshotFromStore(store: UnifiedCardStore): void {
    const canonicalStore = this.prepareCanonicalStore(store);
    const snapshotHash = this.calculateContentHash(canonicalStore);
    const snapshotRevision = canonicalStore.syncMetadata
      ? this.toNumber(canonicalStore.syncMetadata.revision)
      : this.lastKnownRevision;

    this.lastKnownContentHash = snapshotHash;
    this.lastKnownRevision = Math.max(snapshotRevision, 0);
  }

  private clearSaveTimer(): void {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
  }

  private toNumber(value: unknown): number {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === 'string' && value.trim() !== '') {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
    return 0;
  }

  private sanitizeRiffSyncState(value: unknown): RiffSyncState {
    if (!isObjectRecord(value)) {
      return {};
    }

    const lastSuccessfulIncrementalCursor = typeof value.lastSuccessfulIncrementalCursor === 'string'
      && value.lastSuccessfulIncrementalCursor.trim().length > 0
      ? value.lastSuccessfulIncrementalCursor.trim()
      : undefined;
    const lastSuccessfulIncrementalAt = readFiniteNumber(value.lastSuccessfulIncrementalAt);
    const lastSuccessfulFullAt = readFiniteNumber(value.lastSuccessfulFullAt);

    return {
      ...(lastSuccessfulIncrementalCursor ? { lastSuccessfulIncrementalCursor } : {}),
      ...(lastSuccessfulIncrementalAt !== undefined ? { lastSuccessfulIncrementalAt } : {}),
      ...(lastSuccessfulFullAt !== undefined ? { lastSuccessfulFullAt } : {}),
    };
  }

  private chooseMostRecentRiffSyncState(
    localState: RiffSyncState,
    remoteState: RiffSyncState
  ): RiffSyncState {
    return {
      lastSuccessfulIncrementalCursor:
        (localState.lastSuccessfulIncrementalAt ?? 0) >= (remoteState.lastSuccessfulIncrementalAt ?? 0)
          ? localState.lastSuccessfulIncrementalCursor
          : remoteState.lastSuccessfulIncrementalCursor,
      lastSuccessfulIncrementalAt: Math.max(
        localState.lastSuccessfulIncrementalAt ?? 0,
        remoteState.lastSuccessfulIncrementalAt ?? 0
      ) || undefined,
      lastSuccessfulFullAt: Math.max(
        localState.lastSuccessfulFullAt ?? 0,
        remoteState.lastSuccessfulFullAt ?? 0
      ) || undefined,
    };
  }

  private scheduleSave(reason: string = 'unspecified'): void {
    this.dirty = true;
    const hadPendingTimer = this.saveTimer !== null;

    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
    }

    logger.debug('[UnifiedStorageManager] scheduleSave', {
      reason,
      hadPendingTimer,
    });

    this.saveTimer = setTimeout(() => {
      this.save().catch(error => {
        logger.error('Failed to auto-save:', error);
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
    this.indexByState.clear();
    this.indexByDue = [];
    this.indexByPriority.clear();

    // 閲嶅缓绱㈠紩
    for (const dto of this.cardDTOs.values()) {
      const card = this.toDomainCard(dto);
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
  private cloneStringIndexMap<K>(source: Map<K, string[]>): Map<K, string[]> {
    const clone = new Map<K, string[]>();
    for (const [key, ids] of source.entries()) {
      clone.set(key, [...ids]);
    }
    return clone;
  }

  private addIdToIndex<K>(index: Map<K, string[]>, key: K, cardId: string): void {
    const ids = index.get(key) || [];
    if (!ids.includes(cardId)) {
      ids.push(cardId);
      index.set(key, ids);
    }
  }

  private removeIdFromIndex<K>(index: Map<K, string[]>, key: K, cardId: string): void {
    const ids = index.get(key);
    if (!ids) {
      return;
    }

    const position = ids.indexOf(cardId);
    if (position !== -1) {
      ids.splice(position, 1);
    }

    if (ids.length === 0) {
      index.delete(key);
    }
  }

  private removeCardFromDueIndex(cardId: string): void {
    const dueIndex = this.indexByDue.findIndex((candidate) => candidate.id === cardId);
    if (dueIndex !== -1) {
      this.indexByDue.splice(dueIndex, 1);
    }
  }

  private updateIndexesForCard(card: FSRSCard, action: 'add' | 'remove'): void {
    if (action === 'add') {
      // blockID 绱㈠紩
      this.addIdToIndex(this.indexByBlockID, card.blockId, card.id);

      // xiuyuanID 绱㈠紩
      const xiuyuanID = card.xiuyuanID;
      if (xiuyuanID) {
        this.addIdToIndex(this.indexByXiuyuanID, xiuyuanID, card.id);
      }

      // type 绱㈠紩
      this.addIdToIndex(this.indexByType, card.type, card.id);
      this.addIdToIndex(this.indexByState, card.state, card.id);

      // due 绱㈠紩
      this.indexByDue.push(card);

      // priority 绱㈠紩
      this.addIdToIndex(this.indexByPriority, card.priority, card.id);
    } else {
      // 绉婚櫎 blockID 绱㈠紩
      this.removeIdFromIndex(this.indexByBlockID, card.blockId, card.id);

      // 绉婚櫎 xiuyuanID 绱㈠紩
      const xiuyuanID = card.xiuyuanID;
      if (xiuyuanID) {
        this.removeIdFromIndex(this.indexByXiuyuanID, xiuyuanID, card.id);
      }

      // 绉婚櫎 type 绱㈠紩
      this.removeIdFromIndex(this.indexByType, card.type, card.id);
      this.removeIdFromIndex(this.indexByState, card.state, card.id);

      // 绉婚櫎 due 绱㈠紩
      this.removeCardFromDueIndex(card.id);

      // 绉婚櫎 priority 绱㈠紩
      this.removeIdFromIndex(this.indexByPriority, card.priority, card.id);
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
      cards[id] = this.toDomainCard(dto);
    }

    const deletedCardDTOs: Record<string, StorageDeletionTombstone> = {};
    for (const [id, tombstone] of this.deletedCardDTOs.entries()) {
      deletedCardDTOs[id] = tombstone;
    }

    const deletedXiuyuans: Record<string, StorageDeletionTombstone> = {};
    for (const [id, tombstone] of this.deletedXiuyuans.entries()) {
      deletedXiuyuans[id] = tombstone;
    }

    const storeData: UnifiedCardStore = {
      version: CURRENT_UNIFIED_CARD_STORE_VERSION,
      xiuyuans,
      cards,  // 鍚戝悗鍏煎
      cardDTOs,  // 涓绘暟鎹簮
      deletedCardDTOs,
      deletedXiuyuans,
      riffBlacklist: Array.from(this.riffBlacklist),
      riffSyncState: this.sanitizeRiffSyncState(this.riffSyncState),
      syncMetadata: this.lastKnownContentHash
        ? {
            revision: this.lastKnownRevision,
            contentHash: this.lastKnownContentHash,
            lastModifiedAt: Date.now(),
            lastModifiedBy: this.instanceId,
          }
        : undefined,
    };

    if (storeData.syncMetadata) {
      storeData.syncMetadata = {
        ...storeData.syncMetadata,
        contentHash: this.calculateContentHash(storeData),
      };
    }

    return storeData;
  }

  restoreStoreSnapshot(store: UnifiedCardStore): void {
    this.applyStoreSnapshot(store);
    this.clearSaveTimer();
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
      return this.runWriteMutation('batchCreateCards', async () => {
      try {
        for (const card of cards) {
          const result = await this.createCard(xiuyuan, card);
          if (isErr(result)) {
            return result;
          }
        }

        return ok(undefined);
      } catch (error) {
        return err(error instanceof Error ? error : new Error(String(error)));
      }
      });
    }

    // === DTO CRUD 鎿嶄綔 ===

    /**
     * 鍒涘缓鍗＄墖锛堜娇鐢?DTO锛?
     * @param xiuyuan XiuYuan 瀹炰綋
     * @param dto CardPersistenceDTO
     */
    async createCardDTO(xiuyuan: IXiuyuan, dto: CardPersistenceDTO): Promise<Result<void>> {
      return this.runWriteMutation('createCardDTO', async () => {
      try {
        const canonicalXiuyuan = this.resolveCanonicalXiuyuanSnapshot(xiuyuan);
        const canonicalXiuyuanUpdatedAt = readFiniteNumber(canonicalXiuyuan.updatedAt);
        if (this.isBlockedByDeletionTombstone(
          this.deletedXiuyuans,
          canonicalXiuyuan.id,
          canonicalXiuyuanUpdatedAt,
        )) {
          logger.warn('[UnifiedStorageManager] Ignored stale Xiuyuan recreation blocked by tombstone', {
            xiuyuanId: canonicalXiuyuan.id,
            deletedAt: this.deletedXiuyuans.get(canonicalXiuyuan.id)?.deletedAt,
            updatedAt: canonicalXiuyuanUpdatedAt,
          });
          return ok(undefined);
        }

        const normalizedDto: CardPersistenceDTO = {
          ...dto,
          xiuyuanID: canonicalXiuyuan.id,
          meta: {
            ...(dto.meta || {}),
            xiuyuanID: canonicalXiuyuan.id,
          },
        };
        const normalizedUpdatedAt = readFiniteNumber(normalizedDto.updatedAt);
        if (this.isBlockedByDeletionTombstone(
          this.deletedCardDTOs,
          normalizedDto.id,
          normalizedUpdatedAt,
        )) {
          logger.warn('[UnifiedStorageManager] Ignored stale card recreation blocked by tombstone', {
            cardId: normalizedDto.id,
            deletedAt: this.deletedCardDTOs.get(normalizedDto.id)?.deletedAt,
            updatedAt: normalizedUpdatedAt,
          });
          return ok(undefined);
        }

        const existingXiuyuan = this.xiuyuans.get(canonicalXiuyuan.id);
        this.xiuyuans.set(
          canonicalXiuyuan.id,
          existingXiuyuan
            ? mergeXiuyuanSnapshots(existingXiuyuan, canonicalXiuyuan).value
            : canonicalXiuyuan,
        );
        this.clearXiuyuanDeletionTombstoneIfRecreated(canonicalXiuyuan);

        const existingById = this.cardDTOs.get(normalizedDto.id);
        if (existingById) {
          return await this.updateCardDTO(mergeCardDTOsLocalFirst(existingById, normalizedDto, {
            canonicalXiuyuanId: canonicalXiuyuan.id,
          }).value);
        }

        const logicalDuplicate = this.findExistingCardDTOByLogicalKey(normalizedDto, canonicalXiuyuan);
        if (logicalDuplicate) {
          return await this.updateCardDTO(mergeCardDTOsLocalFirst(logicalDuplicate.dto, normalizedDto, {
            canonicalXiuyuanId: canonicalXiuyuan.id,
          }).value);
        }

        this.cardDTOs.set(normalizedDto.id, normalizedDto);
        this.clearCardDeletionTombstoneIfRecreated(normalizedDto);
        this.updateIndexesForDTO(normalizedDto, 'add');

        // 閲嶆柊鎺掑簭 due 绱㈠紩浠ヤ繚鎸佷竴鑷存€?
        this.indexByDue.sort((a, b) => a.due - b.due);

        // 璋冨害淇濆瓨
        this.scheduleSave('create-card-dto');

        return ok(undefined);
      } catch (error) {
        return err(error instanceof Error ? error : new Error(String(error)));
      }
      });
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
    async updateCardDTO(dto: CardPersistenceDTO, options: CardUpdateOptions = {}): Promise<Result<void>> {
      return this.runWriteMutation('updateCardDTO', async () => {
      try {
        // 鉁?闃插尽鎬ф鏌ワ細纭繚 cardDTOs Map 宸插垵濮嬪寲
        if (!this.cardDTOs) {
          logger.error('[UnifiedStorageManager] 鉂?CRITICAL: cardDTOs Map is undefined!');
          return err(new Error('Storage not initialized: cardDTOs Map is undefined'));
        }

        const oldDTO = this.cardDTOs.get(dto.id);
        if (!oldDTO) {
          return err(new Error(`Card not found: ${dto.id}`));
        }

        const xiuyuanId = String(dto.xiuyuanID || oldDTO.xiuyuanID || '').trim();
        const currentXiuyuan = xiuyuanId ? this.xiuyuans.get(xiuyuanId) : undefined;
        const canonicalXiuyuan = currentXiuyuan
          ? this.resolveCanonicalXiuyuanSnapshot(currentXiuyuan)
          : undefined;
        const canonicalXiuyuanId = canonicalXiuyuan?.id || xiuyuanId || undefined;

        const normalizedDto: CardPersistenceDTO = {
          ...dto,
          xiuyuanID: canonicalXiuyuanId,
          meta: canonicalXiuyuanId
            ? {
                ...(dto.meta || {}),
                xiuyuanID: canonicalXiuyuanId,
              }
            : dto.meta,
        };
        const normalizedUpdatedAt = readFiniteNumber(normalizedDto.updatedAt);
        const clearsCardTombstone = this.wouldClearDeletionTombstone(
          this.deletedCardDTOs,
          normalizedDto.id,
          normalizedUpdatedAt,
        );
        const clearsXiuyuanTombstone = canonicalXiuyuan && canonicalXiuyuanId
          ? this.wouldClearDeletionTombstone(
              this.deletedXiuyuans,
              canonicalXiuyuanId,
              readFiniteNumber(canonicalXiuyuan.updatedAt),
            )
          : false;

        const storedCanonicalXiuyuan = canonicalXiuyuanId
          ? this.xiuyuans.get(canonicalXiuyuanId)
          : undefined;
        const shouldUpsertCanonicalXiuyuan = Boolean(canonicalXiuyuan && canonicalXiuyuanId)
          && !areStructurallyEqual(storedCanonicalXiuyuan, canonicalXiuyuan);

        const logicalDuplicate = canonicalXiuyuan
          ? this.findExistingCardDTOByLogicalKey(normalizedDto, canonicalXiuyuan, {
              excludeId: dto.id,
            })
          : null;

        if (
          !logicalDuplicate
          && !shouldUpsertCanonicalXiuyuan
          && !clearsCardTombstone
          && !clearsXiuyuanTombstone
          && areStructurallyEqual(oldDTO, normalizedDto)
        ) {
          logger.trace('[UnifiedStorageManager] updateCardDTO no-op skipped', {
            cardId: normalizedDto.id,
          });
          return ok(undefined);
        }

        if (canonicalXiuyuan && canonicalXiuyuanId) {
          this.xiuyuans.set(
            canonicalXiuyuanId,
            storedCanonicalXiuyuan
              ? mergeXiuyuanSnapshots(storedCanonicalXiuyuan, canonicalXiuyuan).value
              : canonicalXiuyuan,
          );
        }

        if (logicalDuplicate) {
          const merged = mergeCardDTOsLocalFirst(logicalDuplicate.dto, normalizedDto, {
            canonicalXiuyuanId,
            preferIncomingScheduling: options.preferIncomingScheduling,
          }).value;

          this.updateIndexesForDTO(oldDTO, 'remove');
          this.cardDTOs.delete(oldDTO.id);

          this.updateIndexesForDTO(logicalDuplicate.dto, 'remove');
          this.cardDTOs.delete(logicalDuplicate.id);

          this.cardDTOs.set(merged.id, merged);
          if (canonicalXiuyuan) {
            this.clearXiuyuanDeletionTombstoneIfRecreated(canonicalXiuyuan);
          }
          this.clearCardDeletionTombstoneIfRecreated(merged);
          this.updateIndexesForDTO(merged, 'add');
          if (!options.suppressDueIndexSort) {
            this.indexByDue.sort((a, b) => a.due - b.due);
          }
          if (!options.suppressAutosave) {
            this.scheduleSave('update-card-dto-logical-merge');
          }
          return ok(undefined);
        }

        logger.trace('[UnifiedStorageManager] updateCardDTO - Before update:', {
          cardId: normalizedDto.id,
          oldPriority: oldDTO.priority,
          newPriority: normalizedDto.priority,
          oldDTOKeys: Object.keys(oldDTO).length,
          newDTOKeys: Object.keys(normalizedDto).length,
          cardDTOsType: typeof this.cardDTOs,
          cardDTOsSize: this.cardDTOs?.size,
        });

        // 绉婚櫎鏃х储寮?
        this.updateIndexesForDTO(oldDTO, 'remove');

        // 鏇存柊 DTO
        this.cardDTOs.set(normalizedDto.id, normalizedDto);
        if (canonicalXiuyuan) {
          this.clearXiuyuanDeletionTombstoneIfRecreated(canonicalXiuyuan);
        }
        this.clearCardDeletionTombstoneIfRecreated(normalizedDto);

        logger.trace('[UnifiedStorageManager] updateCardDTO - After update:', {
          cardId: normalizedDto.id,
          newPriority: normalizedDto.priority,
          cardDTOsSize: this.cardDTOs.size,
        });

        // 娣诲姞鏂扮储寮?
        this.updateIndexesForDTO(normalizedDto, 'add');

        // 閲嶆柊鎺掑簭 due 绱㈠紩
        if (!options.suppressDueIndexSort) {
          this.indexByDue.sort((a, b) => a.due - b.due);
        }

        // 璋冨害淇濆瓨
        if (!options.suppressAutosave) {
          this.scheduleSave('update-card-dto');
        }

        return ok(undefined);
      } catch (error) {
        return err(error instanceof Error ? error : new Error(String(error)));
      }
      });
    }

    /**
     * 鎵归噺鍒涘缓鍗＄墖锛堜娇鐢?DTO锛屽師瀛愭€ф搷浣滐級
     * @param xiuyuan XiuYuan 瀹炰綋
     * @param dtos CardPersistenceDTO 鏁扮粍
     */
    async batchCreateCardsDTO(xiuyuan: IXiuyuan, dtos: CardPersistenceDTO[]): Promise<Result<void>> {
      return this.runWriteMutation('batchCreateCardsDTO', async () => {
      try {
        for (const dto of dtos) {
          const result = await this.createCardDTO(xiuyuan, dto);
          if (isErr(result)) {
            return result;
          }
        }

        return ok(undefined);
      } catch (error) {
        return err(error instanceof Error ? error : new Error(String(error)));
      }
      });
    }

    /**
     * 鏇存柊绱㈠紩锛堜娇鐢?DTO 鐨勯《灞傚瓧娈碉級
     * @param dto CardPersistenceDTO
     * @param action 鎿嶄綔绫诲瀷锛坅dd 鎴?remove锛?
     */
    private updateIndexesForDTO(dto: CardPersistenceDTO, action: 'add' | 'remove'): void {
      if (action === 'add') {
        // blockID 绱㈠紩
        this.addIdToIndex(this.indexByBlockID, dto.blockId, dto.id);

        // xiuyuanID 绱㈠紩锛堜娇鐢ㄩ《灞傚瓧娈碉紝閬垮厤瑙ｆ瀽 meta锛?
        if (dto.xiuyuanID) {
          this.addIdToIndex(this.indexByXiuyuanID, dto.xiuyuanID, dto.id);
        }

        // type 绱㈠紩
        this.addIdToIndex(this.indexByType, dto.type, dto.id);
        this.addIdToIndex(this.indexByState, dto.state, dto.id);

        // priority 绱㈠紩
        this.addIdToIndex(this.indexByPriority, dto.priority, dto.id);

        // due 绱㈠紩锛堜娇鐢?FSRSCard锛屽洜涓?indexByDue 瀛樺偍鐨勬槸 FSRSCard锛?
        const fsrsCard = this.toDomainCard(dto);
        this.indexByDue.push(fsrsCard);
      } else {
        // 绉婚櫎 blockID 绱㈠紩
        this.removeIdFromIndex(this.indexByBlockID, dto.blockId, dto.id);

        // 绉婚櫎 xiuyuanID 绱㈠紩
        if (dto.xiuyuanID) {
          this.removeIdFromIndex(this.indexByXiuyuanID, dto.xiuyuanID, dto.id);
        }

        // 绉婚櫎 type 绱㈠紩
        this.removeIdFromIndex(this.indexByType, dto.type, dto.id);
        this.removeIdFromIndex(this.indexByState, dto.state, dto.id);

        // 绉婚櫎 priority 绱㈠紩
        this.removeIdFromIndex(this.indexByPriority, dto.priority, dto.id);

        // 绉婚櫎 due 绱㈠紩
        this.removeCardFromDueIndex(dto.id);
      }
    }



  /**
   * 鑾峰彇鍗＄墖
   * @param cardId 鍗＄墖 ID
   */
  getCard(cardId: string): FSRSCard | undefined {
    const dto = this.cardDTOs.get(cardId);
    if (!dto) return undefined;
    return this.toDomainCard(dto);  // 鉁?鍔ㄦ€佽浆鎹?
  }

  /**
   * 鏇存柊鍗＄墖
   * @param card 鏇存柊鍚庣殑鍗＄墖
   */
  async updateCard(card: FSRSCard, options: CardUpdateOptions = {}): Promise<Result<void>> {
    try {
      // 杞崲 FSRSCard 涓?DTO
      const dto = CardMapper.toPersistence(card);
      
      // 璋冪敤 DTO 鏂规硶锛堜繚鎸佸悜鍚庡吋瀹癸級
      return await this.updateCardDTO(dto, options);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  async batchUpdateCards(cards: FSRSCard[], options: CardUpdateOptions = {}): Promise<Result<void>> {
    return this.runWriteMutation('batchUpdateCards', async () => {
      try {
        const dedupedCards = new Map<string, FSRSCard>();
        for (const card of cards || []) {
          if (!card?.id) {
            continue;
          }
          dedupedCards.set(card.id, card);
        }

        if (dedupedCards.size === 0) {
          return ok(undefined);
        }

        let touchedCount = 0;
        for (const card of dedupedCards.values()) {
          const dto = CardMapper.toPersistence(card);
          const result = await this.updateCardDTO(dto, {
            ...options,
            suppressAutosave: true,
            suppressDueIndexSort: true,
          });
          if (isErr(result)) {
            return result;
          }
          touchedCount++;
        }

        if (touchedCount > 0) {
          this.indexByDue.sort((a, b) => a.due - b.due);
          if (!options.suppressAutosave) {
            this.scheduleSave('batch-update-cards');
          }
        }

        logger.debug('[UnifiedStorageManager] batchUpdateCards completed', {
          attempted: dedupedCards.size,
          touched: touchedCount,
        });

        return ok(undefined);
      } catch (error) {
        return err(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  /**
   * 鍒犻櫎鍗＄墖
   * @param cardId 鍗＄墖 ID
   */
  async deleteCard(cardId: string): Promise<Result<void>> {
    return this.runWriteMutation('deleteCard', async () => {
    try {
      const dto = this.cardDTOs.get(cardId);
      if (!dto) {
        return err(new Error(`Card not found: ${cardId}`));
      }
      const deletedAt = Date.now();
      this.recordDeletionTombstone(this.deletedCardDTOs, cardId, deletedAt);

      const card = this.toDomainCard(dto);

      // 绉婚櫎绱㈠紩
      this.updateIndexesForCard(card, 'remove');

      // 鍒犻櫎鍗＄墖
      this.cardDTOs.delete(cardId);

      // 妫€鏌ユ槸鍚﹂渶瑕佸垹闄?XiuYuan
      const xiuyuanID = card.xiuyuanID;
      if (xiuyuanID) {
        const xiuyuanCards = this.indexByXiuyuanID.get(xiuyuanID);
        if (!xiuyuanCards || xiuyuanCards.length === 0) {
          // 娌℃湁鍏朵粬鍗＄墖寮曠敤姝?XiuYuan锛屽垹闄ゅ畠
          this.recordDeletionTombstone(this.deletedXiuyuans, xiuyuanID, deletedAt);
          this.xiuyuans.delete(xiuyuanID);
        }
      }

      // 璋冨害淇濆瓨
      this.scheduleSave('delete-card');

      return ok(undefined);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
    });
  }

  /**
   * 鍒犻櫎 XiuYuan锛堢骇鑱斿垹闄ゆ墍鏈夊叧鑱斿崱鐗囷級
   * @param xiuyuanId XiuYuan ID
   */
  async deleteXiuYuan(xiuyuanId: string): Promise<Result<void>> {
    return this.runWriteMutation('deleteXiuYuan', async () => {
    try {
      const xiuyuan = this.xiuyuans.get(xiuyuanId);
      if (!xiuyuan) {
        return err(new Error(`XiuYuan not found: ${xiuyuanId}`));
      }
      const deletedAt = Date.now();
      this.recordDeletionTombstone(this.deletedXiuyuans, xiuyuanId, deletedAt);

      // 鑾峰彇鎵€鏈夊叧鑱斿崱鐗?
      const cardIds = this.indexByXiuyuanID.get(xiuyuanId) || [];

      // 鍒犻櫎鎵€鏈夊叧鑱斿崱鐗?
      for (const cardId of [...cardIds]) {
        const dto = this.cardDTOs.get(cardId);
        if (dto) {
          this.recordDeletionTombstone(this.deletedCardDTOs, cardId, deletedAt);
          const card = this.toDomainCard(dto);
          this.updateIndexesForCard(card, 'remove');
          this.cardDTOs.delete(cardId);
        }
      }

      // 鍒犻櫎 XiuYuan
      this.xiuyuans.delete(xiuyuanId);

      // 璋冨害淇濆瓨
      this.scheduleSave('delete-xiuyuan');

      return ok(undefined);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
    });
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
      .map(dto => this.toDomainCard(dto));  // 鉁?鍔ㄦ€佽浆鎹?
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
      .map(dto => this.toDomainCard(dto));  // 鉁?鍔ㄦ€佽浆鎹?
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
      .map(dto => this.toDomainCard(dto));  // 鉁?鍔ㄦ€佽浆鎹?
  }

  /**
   * 鑾峰彇鎵€鏈夊崱鐗?
   */
  getAllCards(): FSRSCard[] {
    return Array.from(this.cardDTOs.values()).map(dto => this.toDomainCard(dto));  // 鉁?鍔ㄦ€佽浆鎹?
  }

  /**
   * 鑾峰彇 XiuYuan
   * @param xiuyuanId XiuYuan ID
   */
  getCardsByState(state: number): FSRSCard[] {
    const cardIds = this.indexByState.get(state) || [];
    return cardIds
      .map(id => this.cardDTOs.get(id))
      .filter((dto): dto is CardPersistenceDTO => dto !== undefined)
      .map(dto => this.toDomainCard(dto));
  }

  getCardsByStates(states: number[]): FSRSCard[] {
    const cardIds = new Set<string>();
    for (const state of states) {
      const ids = this.indexByState.get(state) || [];
      for (const id of ids) {
        cardIds.add(id);
      }
    }
    return this.getCardsByIds(cardIds);
  }

  getCardsByBlockIds(blockIds: string[]): FSRSCard[] {
    const cardIds = new Set<string>();
    for (const blockId of blockIds) {
      const ids = this.indexByBlockID.get(blockId) || [];
      for (const id of ids) {
        cardIds.add(id);
      }
    }
    return this.getCardsByIds(cardIds);
  }

  queryCards(query?: StructuredCardQuery): FSRSCard[] {
    if (!query) {
      return this.getAllCards();
    }

    const candidateSets: Array<{ name: string; ids: Set<string> }> = [];

    if (query.blockIds && query.blockIds.length > 0) {
      const blockIds = new Set<string>();
      for (const blockId of query.blockIds) {
        const normalized = String(blockId || '').trim();
        if (!normalized) {
          continue;
        }
        const ids = this.indexByBlockID.get(normalized) || [];
        for (const id of ids) {
          blockIds.add(id);
        }
      }
      candidateSets.push({ name: 'blockIds', ids: blockIds });
    }

    if (query.cardTypes && query.cardTypes.length > 0) {
      const typeIds = new Set<string>();
      for (const type of query.cardTypes) {
        const ids = this.indexByType.get(type) || [];
        for (const id of ids) {
          typeIds.add(id);
        }
      }
      candidateSets.push({ name: 'cardTypes', ids: typeIds });
    }

    if (query.states && query.states.length > 0) {
      const stateIds = new Set<string>();
      for (const state of query.states) {
        const ids = this.indexByState.get(state) || [];
        for (const id of ids) {
          stateIds.add(id);
        }
      }
      candidateSets.push({ name: 'states', ids: stateIds });
    }

    if (query.dueDate?.lte !== undefined) {
      candidateSets.push({ name: 'dueDate.lte', ids: this.collectDueCardIdsUpTo(query.dueDate.lte) });
    }

    let cards: FSRSCard[];
    if (candidateSets.length === 0) {
      cards = this.getAllCards();
    } else {
      candidateSets.sort((left, right) => left.ids.size - right.ids.size);
      const [baseCandidate, ...remainingCandidates] = candidateSets;
      const selectedIds = new Set<string>(baseCandidate.ids);

      for (const candidate of remainingCandidates) {
        for (const id of [...selectedIds]) {
          if (!candidate.ids.has(id)) {
            selectedIds.delete(id);
          }
        }
      }

      logger.debug('[UnifiedStorageManager] queryCards planner', {
        candidates: candidateSets.map((candidate) => ({
          name: candidate.name,
          size: candidate.ids.size,
        })),
        base: baseCandidate.name,
        selected: selectedIds.size,
      });

      cards = this.getCardsByIds(selectedIds);
    }

    return cards.filter((card) => this.matchesStructuredQueryResiduals(card, query));
  }

  private getCardsByIds(cardIds: Iterable<string>): FSRSCard[] {
    const cards: FSRSCard[] = [];
    for (const id of cardIds) {
      const dto = this.cardDTOs.get(id);
      if (dto) {
        cards.push(this.toDomainCard(dto));
      }
    }
    return cards;
  }

  private collectDueCardIdsUpTo(maxDue: number): Set<string> {
    const ids = new Set<string>();
    let left = 0;
    let right = this.indexByDue.length;

    while (left < right) {
      const middle = Math.floor((left + right) / 2);
      if (this.indexByDue[middle]!.due <= maxDue) {
        left = middle + 1;
      } else {
        right = middle;
      }
    }

    for (let index = 0; index < left; index++) {
      ids.add(this.indexByDue[index]!.id);
    }

    return ids;
  }

  private matchesStructuredQueryResiduals(card: FSRSCard, query: StructuredCardQuery): boolean {
    const dismissed = isCardDismissed(card);

    if (query.dueDate?.gte !== undefined && card.due < query.dueDate.gte) {
      return false;
    }

    if (query.priority) {
      if (query.priority.min !== undefined && card.priority < query.priority.min) {
        return false;
      }
      if (query.priority.max !== undefined && card.priority > query.priority.max) {
        return false;
      }
    }

    if (query.tags && query.tags.length > 0) {
      const cardTags = new Set<string>(card.tags || []);
      const metaTags = isObjectRecord(card.meta) && Array.isArray(card.meta.tags)
        ? (card.meta.tags as unknown[])
        : [];
      for (const tag of metaTags) {
        if (typeof tag === 'string') {
          cardTags.add(tag);
        }
      }
      if (!query.tags.some((tag) => cardTags.has(tag))) {
        return false;
      }
    }

    if (query.suspended === true && !dismissed) {
      return false;
    }

    if (query.suspended === false && dismissed) {
      return false;
    }

    if (query.includeSuspended === false && dismissed) {
      return false;
    }

    if (query.customFilter && !query.customFilter(card)) {
      return false;
    }

    return true;
  }

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
    this.xiuyuans.set(xiuyuan.id, normalizeXiuyuanOwnership(xiuyuan));
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
      const card = this.toDomainCard(dto);
      const xiuyuanID = card.xiuyuanID;
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
      const card = this.toDomainCard(dto);
      const xiuyuanID = card.xiuyuanID;
      if (!xiuyuanID || !this.xiuyuans.has(xiuyuanID)) {
        orphanCards.push(card.id);
      }
    }

    for (const cardId of orphanCards) {
      const dto = this.cardDTOs.get(cardId);
      if (dto) {
        const card = this.toDomainCard(dto);
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
      this.scheduleSave('fix-consistency');
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
      const card = this.toDomainCard(dto);
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
    if (this.riffBlacklist.has(blockID)) {
      return;
    }
    this.riffBlacklist.add(blockID);
    this.scheduleSave('add-riff-blacklist');
  }

  removeFromRiffBlacklist(blockID: string): void {
    if (!this.riffBlacklist.has(blockID)) {
      return;
    }

    this.riffBlacklist.delete(blockID);
    this.scheduleSave('remove-riff-blacklist');
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
    if (isErr(result)) {
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
      const xiuyuanId = card.xiuyuanID;
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

    const card = this.toDomainCard(dto);

    // 浠?Map 涓垹闄?
    this.cardDTOs.delete(cardId);

    // 鏇存柊绱㈠紩
    this.updateIndexesForCard(card, 'remove');

    // 鏍囪涓鸿剰
    this.dirty = true;
    this.scheduleSave('remove-card-compat');

    return true;
  }

  /**
   * 淇濆瓨鍗＄墖锛圫torageManager 鍏煎鏂规硶锛?
   * 鍐呴儴璋冪敤 save
   */
  async saveCards(): Promise<void> {
    const result = await this.save();
    if (isErr(result)) {
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

