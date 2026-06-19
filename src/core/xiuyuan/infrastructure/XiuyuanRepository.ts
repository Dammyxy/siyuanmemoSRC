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
import type {
  AppliedSyncSummary,
  SyncChangeSet,
} from '../domain/repositories/SyncChangeSet';
import { IXiuyuan } from '../types';
import { CardState, CardType } from '../../../types/card';
import type { FSRSCard } from '../../../types/card';
import {
  UnifiedStorageManager,
  type StorageMutationOptions,
  type StorageWriteTransaction,
  type UnifiedCardStore,
} from '../../storage/UnifiedStorageManager';
import { getBlockAttrs, setBlockAttrs } from '../../siyuan/api';
import { ATTR_CARD_TYPE } from '../../siyuan/block';
import { TemplateRegistry } from '../templates/TemplateRegistry';
import type { CdfDirectPathSegment } from '@/core/card/common/application/cdfDirectScene';
import { isCdfDirectPathSegmentArray } from '@/core/card/common/application/cdfDirectScene';
import {
  buildLogicalCardKey,
  buildLogicalXiuyuanKey,
  chooseCanonicalXiuyuan,
  inferXiuyuanOwnership,
  mergeXiuyuanSnapshots,
  normalizeXiuyuanOwnership,
  type XiuyuanOwnership,
} from '../../storage/stability/logicalKeys';
import { createLogger } from '@/utils/logger';
import type { CardPersistenceDTO } from '../../../infrastructure/persistence/dto/CardPersistenceDTO';

const logger = createLogger('XiuyuanRepository');
const CARD_ID_DEBUG_SAMPLE_LIMIT = 5;

type XiuyuanCardType = 'item' | 'topic' | 'concept' | 'descriptor' | 'cloze';
type SchedulerType = 'fsrs-v6' | 'a-factor-v2';
type CardIdResolutionStats = {
  sourceCardIds: string[];
  resolvedCardIds: string[];
  missingDtoCardIds: string[];
};

type ListTemplateChild = {
  id: string;
  cue: string;
  answer: string;
  index: number;
  source?: string;
  directPath?: CdfDirectPathSegment[];
};

type FaceSnapshot = {
  question: string;
  answer: string;
  questionBlockId?: string;
  answerBlockId?: string;
};

type XiuyuanMeta = Record<string, unknown> & {
  ownership?: XiuyuanOwnership;
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

export interface XiuyuanSqlReadPort {
  findById(id: string): IXiuyuan | null;
  findByBlockId(blockId: string): IXiuyuan[];
  getCardDTO(cardId: string): CardPersistenceDTO | null;
  getCardDTOsByXiuyuanId(xiuyuanId: string): CardPersistenceDTO[];
}

type DeferredRepositorySideEffects = {
  afterPersist: Array<() => Promise<void>>;
  eventXiuyuans: Xiuyuan[];
};

type TraceAttrsSnapshot = {
  hasXiuyuanBinding: boolean;
  xiuyuanId: string | null;
  legacyXiuyuanId: string | null;
  cardType: string | null;
  attrKeys: string[];
};

function isListTemplateChild(value: unknown): value is ListTemplateChild {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<ListTemplateChild>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.cue === 'string' &&
    typeof candidate.answer === 'string' &&
    Number.isFinite(Number(candidate.index)) &&
    (candidate.source === undefined || typeof candidate.source === 'string') &&
    (candidate.directPath === undefined || isCdfDirectPathSegmentArray(candidate.directPath))
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
    private readonly cardTypeDetectionService?: CardTypeDetectionPort,
    private readonly sqlReadPort?: XiuyuanSqlReadPort | null,
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

  private createDeferredSideEffects(): DeferredRepositorySideEffects {
    return {
      afterPersist: [],
      eventXiuyuans: [],
    };
  }

  private withStorageTransaction<T extends object>(
    options: T,
    transaction: StorageWriteTransaction | undefined,
  ): T & StorageMutationOptions {
    return transaction ? { ...options, transaction } : options;
  }

  private async createStorageCard(
    xiuyuan: IXiuyuan,
    card: FSRSCard,
    transaction?: StorageWriteTransaction,
  ): Promise<Result<void>> {
    return transaction
      ? this.storage.createCard(xiuyuan, card, { transaction })
      : this.storage.createCard(xiuyuan, card);
  }

  private async updateStorageCard(
    card: FSRSCard,
    transaction?: StorageWriteTransaction,
  ): Promise<Result<void>> {
    return transaction
      ? this.storage.updateCard(card, { transaction })
      : this.storage.updateCard(card);
  }

  private async deleteStorageCard(
    cardId: string,
    transaction?: StorageWriteTransaction,
  ): Promise<Result<void>> {
    return transaction
      ? this.storage.deleteCard(cardId, { transaction })
      : this.storage.deleteCard(cardId);
  }

  private async deleteStorageXiuyuan(
    xiuyuanId: string,
    transaction?: StorageWriteTransaction,
  ): Promise<Result<void>> {
    return transaction
      ? this.storage.deleteXiuYuan(xiuyuanId, { transaction })
      : this.storage.deleteXiuYuan(xiuyuanId);
  }

  private removeStorageRiffBlacklist(
    blockId: string,
    transaction?: StorageWriteTransaction,
  ): void {
    if (transaction) {
      this.storage.removeFromRiffBlacklist(blockId, { transaction });
      return;
    }

    this.storage.removeFromRiffBlacklist(blockId);
  }

  private mergeDeferredSideEffects(
    target: DeferredRepositorySideEffects,
    source: DeferredRepositorySideEffects,
  ): DeferredRepositorySideEffects {
    target.afterPersist.push(...source.afterPersist);
    target.eventXiuyuans.push(...source.eventXiuyuans);
    return target;
  }

  private getXiuyuanOwnership(xiuyuan: Xiuyuan): XiuyuanOwnership {
    return inferXiuyuanOwnership({
      templateID: xiuyuan.getTemplateID().getValue(),
      meta: xiuyuan.getMeta(),
    });
  }

  private isManagedRiffXiuyuan(xiuyuan: Xiuyuan): boolean {
    return this.getXiuyuanOwnership(xiuyuan) === 'riff-managed';
  }

  private normalizePersistedXiuyuan(persistenceModel: IXiuyuan): IXiuyuan {
    return normalizeXiuyuanOwnership(persistenceModel);
  }

  private cloneStorageSnapshot(): UnifiedCardStore {
    return JSON.parse(JSON.stringify(this.storage.getStoreData())) as UnifiedCardStore;
  }

  private restoreStorageSnapshot(snapshot: UnifiedCardStore, label: string, error: unknown): void {
    this.storage.restoreStoreSnapshot(snapshot);
    logger.warn(`[XiuyuanRepository] Rolled back in-memory storage snapshot after ${label} failure`, error);
  }

  private buildPersistedBindingAttrs(
    xiuyuan: Xiuyuan,
    boundXiuyuanId = xiuyuan.getId().getValue(),
  ): Record<string, string> | null {
    const attrs: Record<string, string> = {};

    if (!this.isManagedRiffXiuyuan(xiuyuan)) {
      attrs['custom-xiuyuan-id'] = boundXiuyuanId;
    }

    if (this.shouldScrubPersistedCardTypeAttr(xiuyuan)) {
      attrs[ATTR_CARD_TYPE] = '';
    }

    return Object.keys(attrs).length > 0 ? attrs : null;
  }

  private shouldScrubPersistedCardTypeAttr(xiuyuan: Xiuyuan): boolean {
    const meta = xiuyuan.getMeta() as XiuyuanMeta | undefined;
    const progressiveKind = meta?.progressive && typeof meta.progressive === 'object'
      ? (meta.progressive as Record<string, unknown>).kind
      : undefined;

    return progressiveKind === 'piece'
      || progressiveKind === 'excerpt'
      || progressiveKind === 'derived-item';
  }

  private resolveCanonicalPersistedXiuyuan(persistenceModel: IXiuyuan): IXiuyuan {
    const normalizedPersistenceModel = this.normalizePersistedXiuyuan(persistenceModel);
    const logicalKey = buildLogicalXiuyuanKey(normalizedPersistenceModel);
    const existingCandidates = this.storage.getAllXiuYuans()
      .filter((candidate) => buildLogicalXiuyuanKey(candidate) === logicalKey);

    if (existingCandidates.length === 0) {
      return normalizedPersistenceModel;
    }

    const canonical = chooseCanonicalXiuyuan([...existingCandidates, normalizedPersistenceModel]);
    if (canonical.id === normalizedPersistenceModel.id) {
      return normalizedPersistenceModel;
    }

    return mergeXiuyuanSnapshots(canonical, normalizedPersistenceModel).value;
  }

  private applyCanonicalXiuyuanId(card: FSRSCard, xiuyuanId: string): FSRSCard {
    return {
      ...card,
      xiuyuanID: xiuyuanId,
      meta: {
        ...(card.meta || {}),
        xiuyuanID: xiuyuanId,
      },
    };
  }

  private findExistingCardForLogicalKey(card: FSRSCard, canonicalXiuyuan: IXiuyuan): FSRSCard | null {
    const targetLogicalKey = buildLogicalCardKey(card, canonicalXiuyuan);
    const existingCards = card.blockId
      ? this.storage.getCardsByBlockId?.(card.blockId) ?? []
      : [];
    for (const existingCard of existingCards) {
      const existingXiuyuan = this.storage.getXiuYuan(existingCard.xiuyuanID);
      if (buildLogicalCardKey(existingCard, existingXiuyuan) === targetLogicalKey) {
        return existingCard;
      }
    }

    return null;
  }

  private traceAutoCard(event: string, payload: Record<string, unknown>): void {
    logger.debug('[AutoCardTrace]', { event, ...payload });
  }

  private summarizeTraceAttrs(attrs: Record<string, string> | null | undefined): TraceAttrsSnapshot {
    const normalized = attrs ?? {};
    const xiuyuanId = String(normalized['custom-xiuyuan-id'] || '').trim();
    const legacyXiuyuanId = String(normalized['custom-fsrs-xiuyuan-id'] || '').trim();
    const cardType = String(normalized[ATTR_CARD_TYPE] || '').trim();
    return {
      hasXiuyuanBinding: xiuyuanId.length > 0 || legacyXiuyuanId.length > 0,
      xiuyuanId: xiuyuanId || null,
      legacyXiuyuanId: legacyXiuyuanId || null,
      cardType: cardType || null,
      attrKeys: Object.keys(normalized).sort(),
    };
  }

  private isBindingAttrWriteNeeded(
    attrsBeforeWrite: TraceAttrsSnapshot | null,
    bindingAttrs: Record<string, string>,
  ): boolean {
    if (!attrsBeforeWrite) {
      return true;
    }

    const targetXiuyuanId = String(bindingAttrs['custom-xiuyuan-id'] || '').trim();
    if (targetXiuyuanId && attrsBeforeWrite.xiuyuanId !== targetXiuyuanId) {
      return true;
    }

    const targetCardType = String(bindingAttrs[ATTR_CARD_TYPE] || '').trim();
    if (targetCardType.length > 0) {
      return attrsBeforeWrite.cardType !== targetCardType;
    }

    if (ATTR_CARD_TYPE in bindingAttrs) {
      return attrsBeforeWrite.cardType !== null && attrsBeforeWrite.cardType.length > 0;
    }

    return false;
  }

  private sampleCardIds(cardIds: string[]): string[] {
    return cardIds.slice(0, CARD_ID_DEBUG_SAMPLE_LIMIT);
  }

  private async readTraceAttrs(blockId: string): Promise<TraceAttrsSnapshot | null> {
    try {
      return this.summarizeTraceAttrs(await getBlockAttrs(blockId));
    } catch (error) {
      this.traceAutoCard('XiuyuanRepository.save.attrsReadFailed', {
        blockId,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * 淇濆瓨 Xiuyuan 鑱氬悎鏍?
   * 
   * @param xiuyuan - Xiuyuan 鑱氬悎鏍?
   * @returns Result<void>
   */
  async save(xiuyuan: Xiuyuan): Promise<Result<void>> {
    const transactionalResult = await this.storage.runWriteTransaction('xiuyuan-repository.save', async (transaction) => {
      const rollbackSnapshot = this.cloneStorageSnapshot();
      try {
        const stagedResult = await this.stageSaveXiuyuanMutation(xiuyuan, transaction);
        if (!stagedResult.ok) {
          this.restoreStorageSnapshot(rollbackSnapshot, 'save', stagedResult.error);
          return stagedResult;
        }

        const saveResult = await this.storage.save({ transaction });
        if (isErr(saveResult)) {
          const error = saveResult.error || new Error('Failed to persist xiuyuan snapshot');
          logger.error('Failed to persist xiuyuan snapshot:', error);
          this.restoreStorageSnapshot(rollbackSnapshot, 'save', error);
          return err(error);
        }

        return ok(stagedResult.value);
      } catch (error) {
        this.restoreStorageSnapshot(rollbackSnapshot, 'save', error);
        return err(error instanceof Error ? error : new Error(String(error)));
      }
    });

    if (!transactionalResult.ok) {
      return transactionalResult;
    }

    await this.runDeferredSideEffects(transactionalResult.value);
    return ok(undefined);
  }

  async applySyncChangeSet(changeSet: SyncChangeSet): Promise<Result<AppliedSyncSummary>> {
    const transactionalResult = await this.storage.runWriteTransaction('xiuyuan-repository.applySyncChangeSet', async (transaction) => {
      const rollbackSnapshot = this.cloneStorageSnapshot();
      try {
        const deferredSideEffects = this.createDeferredSideEffects();

        for (const create of changeSet.creates) {
          const stageResult = await this.stageSaveXiuyuanMutation(create.xiuyuanEntity, transaction);
          if (!stageResult.ok) {
            this.restoreStorageSnapshot(rollbackSnapshot, 'applySyncChangeSet', stageResult.error);
            return stageResult;
          }
          this.mergeDeferredSideEffects(deferredSideEffects, stageResult.value);
        }

        for (const update of changeSet.metadataUpdates) {
          const stageResult = await this.stageSaveXiuyuanMutation(update.xiuyuanEntity, transaction);
          if (!stageResult.ok) {
            this.restoreStorageSnapshot(rollbackSnapshot, 'applySyncChangeSet', stageResult.error);
            return stageResult;
          }
          this.mergeDeferredSideEffects(deferredSideEffects, stageResult.value);
        }

        for (const deletion of changeSet.deletes) {
          const stageResult = await this.stageDeleteXiuyuanMutation(deletion.xiuyuanEntity, transaction);
          if (!stageResult.ok) {
            this.restoreStorageSnapshot(rollbackSnapshot, 'applySyncChangeSet', stageResult.error);
            return stageResult;
          }
          this.mergeDeferredSideEffects(deferredSideEffects, stageResult.value);
        }

        const blacklistCleanup = Array.from(new Set(changeSet.blacklistCleanup));
        for (const blockId of blacklistCleanup) {
          this.removeStorageRiffBlacklist(blockId, transaction);
        }

        if (changeSet.checkpointAdvance) {
          this.storage.patchRiffSyncState(
            changeSet.checkpointAdvance,
            this.withStorageTransaction({ scheduleSave: false }, transaction),
          );
        }

        const saveResult = await this.storage.save({ transaction });
        if (isErr(saveResult)) {
          const error = saveResult.error || new Error('Failed to persist sync change set');
          logger.error('Failed to persist sync change set:', error);
          this.restoreStorageSnapshot(rollbackSnapshot, 'applySyncChangeSet', error);
          return err(error);
        }

        return ok({
          deferredSideEffects,
          summary: {
            createdCount: changeSet.creates.length,
            updatedCount: changeSet.metadataUpdates.length,
            deletedCount: changeSet.deletes.length,
            blacklistCleanedCount: blacklistCleanup.length,
            checkpointApplied: Boolean(changeSet.checkpointAdvance),
          },
        });
      } catch (error) {
        this.restoreStorageSnapshot(rollbackSnapshot, 'applySyncChangeSet', error);
        return err(error instanceof Error ? error : new Error(String(error)));
      }
    });

    if (!transactionalResult.ok) {
      return transactionalResult;
    }

    await this.runDeferredSideEffects(transactionalResult.value.deferredSideEffects);
    return ok(transactionalResult.value.summary);
  }

  /**
   * 鏍规嵁 ID 鏌ユ壘 Xiuyuan
   * 
   * @param id - Xiuyuan ID
   * @returns Result<Xiuyuan | null>
   */
  async findById(id: XiuyuanId): Promise<Result<Xiuyuan | null>> {
    try {
      const data = this.sqlReadPort
        ? this.sqlReadPort.findById(id.getValue())
        : this.storage.getXiuYuan(id.getValue());
      if (!data) {
        return ok(null);
      }

      const result = this.toDomain(data, this.sqlReadPort || undefined);
      if (isErr(result)) {
        return result;
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
      const allXiuyuans = this.sqlReadPort
        ? this.sqlReadPort.findByBlockId(blockId.getValue())
        : this.storage.getAllXiuYuans();
      const xiuyuans: Xiuyuan[] = [];

      // 杩囨护鍖呭惈鎸囧畾 blockID 鐨?XiuYuans
      for (const data of allXiuyuans) {
        if (data.blockIDs.includes(blockId.getValue())) {
          const result = this.toDomain(data, this.sqlReadPort || undefined);
          if (result.ok && result.value.xiuyuan) {
            xiuyuans.push(result.value.xiuyuan);
          }
        }
      }

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
      this.cardToXiuyuanIndex.clear();

      for (const data of dataList) {
        const result = this.toDomain(data);
        if (result.ok && result.value.xiuyuan) {
          xiuyuans.push(result.value.xiuyuan);
          
          // 馃殌 鍒濆鍖栫储寮曪細鏋勫缓鍗＄墖ID -> XiuyuanID鏄犲皠
          const xiuyuan = result.value.xiuyuan;
          const xiuyuanId = xiuyuan.getId().getValue();
          for (const card of xiuyuan.getCards()) {
            this.cardToXiuyuanIndex.set(card.getId().getValue(), xiuyuanId);
          }
        }
      }

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
    const transactionalResult = await this.storage.runWriteTransaction('xiuyuan-repository.delete', async (transaction) => {
      const rollbackSnapshot = this.cloneStorageSnapshot();
      try {
        const stagedResult = await this.stageDeleteXiuyuanMutation(xiuyuan, transaction);
        if (!stagedResult.ok) {
          this.restoreStorageSnapshot(rollbackSnapshot, 'delete', stagedResult.error);
          return stagedResult;
        }

        const saveResult = await this.storage.save({ transaction });
        if (isErr(saveResult)) {
          const error = saveResult.error || new Error('Failed to persist xiuyuan deletion');
          logger.error('Failed to persist xiuyuan deletion:', error);
          this.restoreStorageSnapshot(rollbackSnapshot, 'delete', error);
          return err(error);
        }

        return ok(stagedResult.value);
      } catch (error) {
        this.restoreStorageSnapshot(rollbackSnapshot, 'delete', error);
        return err(error instanceof Error ? error : new Error(String(error)));
      }
    });

    if (!transactionalResult.ok) {
      return transactionalResult;
    }

    await this.runDeferredSideEffects(transactionalResult.value);
    return ok(undefined);
  }

  /**
   * 鎵归噺淇濆瓨 Xiuyuan
   * 
   * @param xiuyuans - Xiuyuan 鍒楄〃
   * @returns Result<void>
   */
  async saveMany(xiuyuans: Xiuyuan[]): Promise<Result<void>> {
    try {
      if (xiuyuans.length === 0) {
        return ok(undefined);
      }

      const transactionalResult = await this.storage.runWriteTransaction('xiuyuan-repository.saveMany', async (transaction) => {
        const rollbackSnapshot = this.cloneStorageSnapshot();
        const deferredSideEffects = this.createDeferredSideEffects();

        try {
          for (const xiuyuan of xiuyuans) {
            const stagedResult = await this.stageSaveXiuyuanMutation(xiuyuan, transaction);
            if (!stagedResult.ok) {
              this.restoreStorageSnapshot(rollbackSnapshot, 'saveMany', stagedResult.error);
              return stagedResult;
            }
            this.mergeDeferredSideEffects(deferredSideEffects, stagedResult.value);
          }

          const saveResult = await this.storage.save({ transaction });
          if (isErr(saveResult)) {
            const error = saveResult.error || new Error('Failed to persist xiuyuan batch snapshot');
            logger.error('Failed to persist xiuyuan batch snapshot:', error);
            this.restoreStorageSnapshot(rollbackSnapshot, 'saveMany', error);
            return err(error);
          }

          return ok(deferredSideEffects);
        } catch (error) {
          this.restoreStorageSnapshot(rollbackSnapshot, 'saveMany', error);
          return err(error instanceof Error ? error : new Error(String(error)));
        }
      });

      if (!transactionalResult.ok) {
        return transactionalResult;
      }

      await this.runDeferredSideEffects(transactionalResult.value);
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

  private async stageSaveXiuyuanMutation(
    xiuyuan: Xiuyuan,
    transaction?: StorageWriteTransaction,
  ): Promise<Result<DeferredRepositorySideEffects>> {
    try {
      const blockIDs = xiuyuan.getBlockIDs();
      const representativeBlockId = xiuyuan.getRepresentativeBlockId();
      const isDescriptorTemplate = representativeBlockId !== blockIDs[0]?.getValue();

      const persistenceModel = this.resolveCanonicalPersistedXiuyuan(this.toPersistenceWithId(xiuyuan));
      const xiuyuanId = persistenceModel.id;

      const existing = this.storage.getXiuYuan(xiuyuanId);
      this.storage.upsertXiuYuan(
        existing
          ? mergeXiuyuanSnapshots(existing, persistenceModel).value
          : persistenceModel,
      );

      const cards = xiuyuan.getCards();
      const resolvedCards: FSRSCard[] = [];
      for (const card of cards) {
        const fsrsCard = this.applyCanonicalXiuyuanId(
          await this.cardToFSRSCard(card, xiuyuan),
          xiuyuanId,
        );
        const existingCard = this.storage.getCard(card.getId().getValue())
          ?? this.findExistingCardForLogicalKey(fsrsCard, persistenceModel);
        resolvedCards.push(existingCard ? {
          ...fsrsCard,
          id: existingCard.id,
        } : fsrsCard);
      }

      const currentCardIds = new Set(resolvedCards.map((card) => card.id));
      const bindingAttrs = this.buildPersistedBindingAttrs(xiuyuan, xiuyuanId);
      const existingXiuyuanCards = this.storage.getCardsByXiuyuanId(xiuyuanId);
      const cardsToDelete = existingXiuyuanCards.filter(
        storageCard => !currentCardIds.has(storageCard.id)
      );

      this.traceAutoCard('XiuyuanRepository.save.begin', {
        xiuyuanId,
        representativeBlockId,
        isDescriptorTemplate,
        scrubsDeprecatedCardTypeAttr: bindingAttrs?.[ATTR_CARD_TYPE] === '',
        existedBefore: Boolean(existing),
        existingXiuyuanCardsCount: existingXiuyuanCards.length,
        currentCardCount: cards.length,
        currentCardIds: this.sampleCardIds(Array.from(currentCardIds)),
        currentCardIdsTruncated: currentCardIds.size > CARD_ID_DEBUG_SAMPLE_LIMIT,
        cardsToDeleteCount: cardsToDelete.length,
        cardsToDeleteSample: this.sampleCardIds(cardsToDelete.map((card) => card.id)),
        bindingAttrs,
      });

      for (const cardToDelete of cardsToDelete) {
        await this.deleteStorageCard(cardToDelete.id, transaction);
      }

      for (const fsrsCard of resolvedCards) {
        const existingCard = this.storage.getCard(fsrsCard.id);

        if (existingCard) {
          await this.updateStorageCard(fsrsCard, transaction);
        } else {
          await this.createStorageCard(persistenceModel, fsrsCard, transaction);
        }
      }

      for (const [cardId, indexedXiuyuanId] of this.cardToXiuyuanIndex.entries()) {
        if (indexedXiuyuanId === xiuyuanId) {
          this.cardToXiuyuanIndex.delete(cardId);
        }
      }
      for (const card of resolvedCards) {
        this.cardToXiuyuanIndex.set(card.id, xiuyuanId);
      }
      for (const cardToDelete of cardsToDelete) {
        this.cardToXiuyuanIndex.delete(cardToDelete.id);
      }

      const sideEffects = this.createDeferredSideEffects();
      this.addSaveBlockAttrSideEffect(sideEffects, {
        xiuyuanId,
        blockIDs,
        bindingAttrs,
        isDescriptorTemplate,
      });
      sideEffects.eventXiuyuans.push(xiuyuan);
      return ok(sideEffects);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  private addSaveBlockAttrSideEffect(
    sideEffects: DeferredRepositorySideEffects,
    params: {
      xiuyuanId: string;
      blockIDs: BlockId[];
      bindingAttrs: Record<string, string> | null;
      isDescriptorTemplate: boolean;
    },
  ): void {
    const { xiuyuanId, blockIDs, bindingAttrs, isDescriptorTemplate } = params;
    if (!bindingAttrs) {
      return;
    }

    if (isDescriptorTemplate && blockIDs.length >= 2) {
      const descriptorBlockId = blockIDs[1]!.getValue();
      sideEffects.afterPersist.push(async () => {
        const attrsBeforeWrite = await this.readTraceAttrs(descriptorBlockId);
        if (!this.isBindingAttrWriteNeeded(attrsBeforeWrite, bindingAttrs)) {
          logger.debug(`Skip unchanged descriptor attributes: descriptor=${descriptorBlockId}`);
          return;
        }
        this.traceAutoCard('XiuyuanRepository.save.attrWrite.begin', {
          xiuyuanId,
          targetKind: 'descriptor',
          blockId: descriptorBlockId,
          bindingAttrs,
          attrsBeforeWrite,
        });

        try {
          await setBlockAttrs(descriptorBlockId, bindingAttrs);
          const attrsAfterWrite = await this.readTraceAttrs(descriptorBlockId);
          this.traceAutoCard('XiuyuanRepository.save.attrWrite.end', {
            xiuyuanId,
            targetKind: 'descriptor',
            blockId: descriptorBlockId,
            bindingAttrs,
            attrsBeforeWrite,
            attrsAfterWrite,
            ok: true,
          });
          logger.debug(`Set descriptor attributes: descriptor=${descriptorBlockId}`);
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          const lowerErrorMsg = errorMsg.toLowerCase();
          const attrsAfterWrite = await this.readTraceAttrs(descriptorBlockId);
          this.traceAutoCard('XiuyuanRepository.save.attrWrite.end', {
            xiuyuanId,
            targetKind: 'descriptor',
            blockId: descriptorBlockId,
            bindingAttrs,
            attrsBeforeWrite,
            attrsAfterWrite,
            ok: false,
            error: errorMsg,
          });
          if (!lowerErrorMsg.includes('not found') && !lowerErrorMsg.includes('tree not found')) {
            logger.warn('Failed to write descriptor attributes:', error);
          }
        }
      });
      return;
    }

    if (blockIDs.length === 0) {
      return;
    }

    const representativeBlockId = blockIDs[0]!.getValue();
    sideEffects.afterPersist.push(async () => {
      const attrsBeforeWrite = await this.readTraceAttrs(representativeBlockId);
      if (!this.isBindingAttrWriteNeeded(attrsBeforeWrite, bindingAttrs)) {
        logger.debug(`Skip unchanged block attributes: block=${representativeBlockId}`);
        return;
      }
      this.traceAutoCard('XiuyuanRepository.save.attrWrite.begin', {
        xiuyuanId,
        targetKind: 'representative',
        blockId: representativeBlockId,
        bindingAttrs,
        attrsBeforeWrite,
      });

      try {
        await setBlockAttrs(representativeBlockId, bindingAttrs);
        const attrsAfterWrite = await this.readTraceAttrs(representativeBlockId);
        this.traceAutoCard('XiuyuanRepository.save.attrWrite.end', {
          xiuyuanId,
          targetKind: 'representative',
          blockId: representativeBlockId,
          bindingAttrs,
          attrsBeforeWrite,
          attrsAfterWrite,
          ok: true,
        });
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        const lowerErrorMsg = errorMsg.toLowerCase();
        const attrsAfterWrite = await this.readTraceAttrs(representativeBlockId);
        this.traceAutoCard('XiuyuanRepository.save.attrWrite.end', {
          xiuyuanId,
          targetKind: 'representative',
          blockId: representativeBlockId,
          bindingAttrs,
          attrsBeforeWrite,
          attrsAfterWrite,
          ok: false,
          error: errorMsg,
        });
        if (lowerErrorMsg.includes('not found') || lowerErrorMsg.includes('tree not found')) {
          logger.debug(`Block ${representativeBlockId} not found, skipping attribute write`);
        } else {
          logger.warn('Failed to write block attributes:', error);
        }
      }
    });
  }

  private async stageDeleteXiuyuanMutation(
    xiuyuan: Xiuyuan,
    transaction?: StorageWriteTransaction,
  ): Promise<Result<DeferredRepositorySideEffects>> {
    try {
      const xiuyuanId = xiuyuan.getId().getValue();

      for (const [cardId, indexedXiuyuanId] of this.cardToXiuyuanIndex.entries()) {
        if (indexedXiuyuanId === xiuyuanId) {
          this.cardToXiuyuanIndex.delete(cardId);
        }
      }

      const deleteResult = await this.deleteStorageXiuyuan(xiuyuanId, transaction);
      if (!deleteResult.ok) {
        return deleteResult;
      }

      const sideEffects = this.createDeferredSideEffects();
      const blockIDs = xiuyuan.getBlockIDs();
      if (!this.isManagedRiffXiuyuan(xiuyuan) && blockIDs.length > 0) {
        const representativeBlockId = blockIDs[0]!.getValue();
        sideEffects.afterPersist.push(async () => {
          try {
            await setBlockAttrs(representativeBlockId, {
              'custom-xiuyuan-id': '',
            });
          } catch (error) {
            logger.warn('Failed to clear block attributes:', error);
          }
        });
      }

      sideEffects.eventXiuyuans.push(xiuyuan);
      return ok(sideEffects);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  private async runDeferredSideEffects(sideEffects: DeferredRepositorySideEffects): Promise<void> {
    for (const sideEffect of sideEffects.afterPersist) {
      try {
        await sideEffect();
      } catch (error) {
        logger.warn('Deferred Xiuyuan side effect failed after persistence:', error);
      }
    }

    for (const xiuyuan of sideEffects.eventXiuyuans) {
      await this.publishDomainEvents(xiuyuan);
    }
  }

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
          index: child.index,
          ...(typeof child.source === 'string' ? { source: child.source } : {}),
          ...(isCdfDirectPathSegmentArray(child.directPath) ? { directPath: child.directPath } : {}),
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
    let typeMarker: string | undefined = typeof meta.typeMarker === 'string' ? meta.typeMarker : undefined;
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
  private toDomain(
    data: IXiuyuan,
    cardDtoReader: Pick<UnifiedStorageManager, 'getCardDTO' | 'getCardDTOsByXiuyuanId'> | XiuyuanSqlReadPort = this.storage,
  ): Result<{ xiuyuan: Xiuyuan | null; cardIdStats: CardIdResolutionStats }> {
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

      const sourceCardIds = this.extractCardIdsFromMeta(data.meta);
      const fallbackCardDTOs = sourceCardIds.length === 0
        ? this.resolveCardDTOsByXiuyuanId(data.id, cardDtoReader)
        : [];
      const preloadedCardDTOs = new Map<string, CardPersistenceDTO>(
        fallbackCardDTOs.map((dto) => [dto.id, dto]),
      );
      if (sourceCardIds.length > 0 && !this.hasUsableFaces(data.meta)) {
        for (const cardId of sourceCardIds) {
          const cardDTO = cardDtoReader.getCardDTO(cardId);
          if (cardDTO) {
            preloadedCardDTOs.set(cardId, cardDTO);
          }
        }
      }
      const hydratedMeta = this.hydrateXiuyuanMetaFromCardDTOs(
        data.meta || {},
        Array.from(preloadedCardDTOs.values()),
      );

      // 4. 杞崲 Faces锛堜粠 meta 涓仮澶嶏級
      const rawFaces = hydratedMeta.faces;
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
      const cardIds = sourceCardIds.length > 0
        ? sourceCardIds
        : fallbackCardDTOs.map((dto) => dto.id);
      const missingDtoCardIds: string[] = [];
      const resolvedCardIds: string[] = [];
      
      logger.debug(`toDomain: Xiuyuan ${data.id} has ${sourceCardIds.length} cardIds in meta`, {
        fallbackCardIdCount: sourceCardIds.length === 0 ? cardIds.length : 0,
      });
      
      for (const cardId of cardIds) {
        const cardDTO = preloadedCardDTOs.get(cardId) ?? cardDtoReader.getCardDTO(cardId);
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
        meta: hydratedMeta,
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
          sourceCardIds,
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

  private resolveCardIdsByXiuyuanId(
    xiuyuanId: string,
    cardDtoReader: Pick<UnifiedStorageManager, 'getCardDTO' | 'getCardDTOsByXiuyuanId'> | XiuyuanSqlReadPort,
  ): string[] {
    return this.resolveCardDTOsByXiuyuanId(xiuyuanId, cardDtoReader).map((dto) => dto.id);
  }

  private resolveCardDTOsByXiuyuanId(
    xiuyuanId: string,
    cardDtoReader: Pick<UnifiedStorageManager, 'getCardDTO' | 'getCardDTOsByXiuyuanId'> | XiuyuanSqlReadPort,
  ): CardPersistenceDTO[] {
    const dtoReader = cardDtoReader as Pick<UnifiedStorageManager, 'getCardDTOsByXiuyuanId'> & Partial<XiuyuanSqlReadPort>;
    const cardDTOs = dtoReader.getCardDTOsByXiuyuanId?.(xiuyuanId) ?? [];
    return cardDTOs.filter((dto): dto is CardPersistenceDTO => Boolean(dto?.id));
  }

  private hasUsableFaces(meta: Record<string, unknown> | undefined): boolean {
    return Array.isArray(meta?.faces) && meta.faces.some(isFaceSnapshot);
  }

  private hydrateXiuyuanMetaFromCardDTOs(
    meta: Record<string, unknown>,
    cardDTOs: CardPersistenceDTO[],
  ): Record<string, unknown> {
    if (cardDTOs.length === 0) {
      return meta;
    }

    const hydrated: Record<string, unknown> = { ...meta };
    if (!this.hasUsableFaces(hydrated)) {
      const faces = this.resolveFacesFromCardDTOs(cardDTOs);
      if (faces.length > 0) {
        hydrated.faces = faces;
      }
    }

    const primaryDTO = cardDTOs[0];
    if (primaryDTO) {
      const dtoMeta = primaryDTO.meta && typeof primaryDTO.meta === 'object'
        ? primaryDTO.meta as Record<string, unknown>
        : {};
      for (const key of [
        'typeMarker',
        'rootId',
        'source',
        'content',
        'blockType',
        'isDocument',
        'ownership',
        'riffCardId',
        'deckId',
      ] as const) {
        if (hydrated[key] === undefined && dtoMeta[key] !== undefined) {
          hydrated[key] = dtoMeta[key];
        }
      }
      if (hydrated.fieldMapping === undefined && primaryDTO.fieldMapping) {
        hydrated.fieldMapping = { ...primaryDTO.fieldMapping };
      }
    }

    return hydrated;
  }

  private resolveFacesFromCardDTOs(cardDTOs: CardPersistenceDTO[]): FaceSnapshot[] {
    const facesByIndex = new Map<number, FaceSnapshot>();
    for (const dto of cardDTOs) {
      const meta = dto.meta && typeof dto.meta === 'object'
        ? dto.meta as Record<string, unknown>
        : {};
      if (Array.isArray(meta.faces)) {
        for (let index = 0; index < meta.faces.length; index += 1) {
          const face = meta.faces[index];
          if (isFaceSnapshot(face)) {
            facesByIndex.set(index, face);
          }
        }
      }

      const faceIndex = readFiniteNumber(meta.faceIndex) ?? 0;
      if (!facesByIndex.has(faceIndex)) {
        const frontBlockId = Array.isArray(dto.frontBlockIDs) ? dto.frontBlockIDs[0] : undefined;
        const backBlockId = Array.isArray(dto.backBlockIDs) ? dto.backBlockIDs[0] : undefined;
        const content = typeof meta.content === 'string' && meta.content.trim()
          ? meta.content
          : dto.blockId;
        facesByIndex.set(faceIndex, {
          question: content,
          answer: content,
          questionBlockId: frontBlockId || dto.blockId,
          answerBlockId: backBlockId || frontBlockId || dto.blockId,
        });
      }
    }

    return Array.from(facesByIndex.entries())
      .sort(([left], [right]) => left - right)
      .map(([, face]) => face);
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
