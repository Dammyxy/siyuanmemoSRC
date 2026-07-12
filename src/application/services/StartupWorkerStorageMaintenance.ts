import type {
  BackendCardScheduleBatchUpdateRequest,
  BackendCardScheduleBatchUpdateResult,
  BackendStorageMaintenanceApplyBatchRequest,
  BackendStorageMaintenanceApplyBatchResult,
  BackendStorageMaintenanceFrontier,
  BackendStorageMaintenanceStatusRequest,
  BackendStorageMaintenanceStatusResult,
} from '../../../packages/contracts/src/backend-rpc';
import { UnifiedStorageManager } from '@/core/storage/UnifiedStorageManager';
import { XiuyuanRepository } from '@/core/xiuyuan/infrastructure/XiuyuanRepository';
import type { FSRSCard } from '@/types/card';
import { isErr } from '@/types/result';
import { createLogger } from '@/utils/logger';

const logger = createLogger('StartupWorkerStorageMaintenance');
const SCHEDULE_BATCH_SIZE = 128;
const ORPHAN_REPAIR_BATCH_SIZE = 64;
const STARTUP_STORAGE_MAINTENANCE_VERSION = 'startup-storage-maintenance-v1';
const STARTUP_STORAGE_MAINTENANCE_RECEIPT_VERSION = 'startup-storage-maintenance-receipt-v2';
const STARTUP_STORAGE_MAINTENANCE_KIND = 'startup-storage-maintenance';

export interface StartupMaintenanceReceiptScope {
  pluginInstallationId: string;
  identityEpoch: string;
  inputVersion: string;
  frontierHash: string;
  externalInputDirtyGeneration: number;
  pendingExternalMerge: boolean;
}

export interface StartupWorkerStorageMaintenanceDiagnostics {
  operationId: string;
  phaseClassifications: {
    scheduleNormalization: 'deferred-safe';
    orphanCardRepair: 'deferred-safe';
  };
  schedule: {
    migratedLegacySchedulerCount: number;
    normalizedMalformedScheduleCount: number;
    affectedCardCount: number;
    completedBatches: number;
    totalBatches: number;
  };
  orphanRepair: {
    discoveredCardCount: number;
    repairedCardCount: number;
    completedBatches: number;
    totalBatches: number;
  };
}

export interface StartupWorkerStorageMaintenanceOptions {
  storage: UnifiedStorageManager;
  executeScheduleBatch(
    request: BackendCardScheduleBatchUpdateRequest,
  ): Promise<BackendCardScheduleBatchUpdateResult>;
  readReceipt?: (
    request: BackendStorageMaintenanceStatusRequest,
  ) => Promise<BackendStorageMaintenanceStatusResult>;
  writeReceipt?: (
    request: BackendStorageMaintenanceApplyBatchRequest,
  ) => Promise<BackendStorageMaintenanceApplyBatchResult>;
  receiptScope?: StartupMaintenanceReceiptScope | null;
  saveOrphanBatch?: (
    storage: UnifiedStorageManager,
    orphanCards: FSRSCard[],
  ) => Promise<number>;
}

export async function runStartupWorkerStorageMaintenance(
  options: StartupWorkerStorageMaintenanceOptions,
): Promise<StartupWorkerStorageMaintenanceDiagnostics> {
  const operationId = STARTUP_STORAGE_MAINTENANCE_VERSION;
  const receiptScope = options.receiptScope ?? null;
  const receipt = createReceiptDescriptor(receiptScope);
  const initialStatus = await readReceiptStatus(options, receipt, 'initial');
  if (isCompletedReceiptMatch(initialStatus, receipt, receiptScope)) {
    const diagnostics = {
      operationId,
      phaseClassifications: startupMaintenancePhaseClassifications(),
      schedule: emptyScheduleDiagnostics(),
      orphanRepair: emptyOrphanRepairDiagnostics(),
    };
    logger.info('Worker startup storage maintenance skipped by receipt', diagnostics);
    return diagnostics;
  }

  const preSuccessScope = normalizeReceiptScope(initialStatus?.currentFrontier) ?? receiptScope;
  const schedule = await normalizeSchedules(options, operationId);
  const orphanRepair = await repairOrphanCards(options);
  const diagnostics = {
    operationId,
    phaseClassifications: startupMaintenancePhaseClassifications(),
    schedule,
    orphanRepair,
  };
  await writeCompletedReceipt(options, preSuccessScope);
  logger.info('Worker startup storage maintenance completed', diagnostics);
  return diagnostics;
}

async function readReceiptStatus(
  options: StartupWorkerStorageMaintenanceOptions,
  receipt: BackendStorageMaintenanceStatusRequest | null,
  phase: 'initial' | 'post-success',
): Promise<BackendStorageMaintenanceStatusResult | null> {
  if (!receipt || !options.readReceipt) {
    return null;
  }
  try {
    return await options.readReceipt(receipt);
  } catch (error) {
    const message = errorMessage(error);
    logger.warn('Startup maintenance receipt read failed; running full scan', {
      phase,
      error: message,
    });
    return {
      operationId: receipt.operationId,
      migrationId: receipt.migrationId,
      required: true,
      status: 'pending',
      completedBatches: 0,
      totalBatches: null,
      lastMutationId: null,
      completedAt: null,
      error: `STORAGE_MAINTENANCE_STATUS_UNAVAILABLE: ${message}`,
      currentFrontier: null,
    };
  }
}

async function writeCompletedReceipt(
  options: StartupWorkerStorageMaintenanceOptions,
  preSuccessScope: StartupMaintenanceReceiptScope | null,
): Promise<void> {
  if (!preSuccessScope || !options.writeReceipt) {
    return;
  }
  const postSuccessScope = await readPostSuccessReceiptScope(options, preSuccessScope);
  if (!postSuccessScope) {
    logger.warn('Startup maintenance receipt write skipped; post-success frontier unavailable');
    return;
  }
  const receipt = createReceiptDescriptor(postSuccessScope);
  if (!receipt) {
    return;
  }
  try {
    await options.writeReceipt({
      ...receipt,
      batchIndex: 0,
      totalBatches: 1,
      batch: {
        kind: 'startup-maintenance-receipt',
        appliedAt: Date.now(),
        receiptVersion: STARTUP_STORAGE_MAINTENANCE_RECEIPT_VERSION,
        maintenanceKind: STARTUP_STORAGE_MAINTENANCE_KIND,
        preSuccessFrontier: toBackendFrontier(preSuccessScope),
        postSuccessFrontier: toBackendFrontier(postSuccessScope),
      },
    });
  } catch (error) {
    logger.warn('Startup maintenance receipt write failed; next startup will rescan', {
      error: errorMessage(error),
    });
  }
}

function createReceiptDescriptor(
  receiptScope: StartupMaintenanceReceiptScope | null,
): BackendStorageMaintenanceStatusRequest | null {
  if (!receiptScope) {
    return null;
  }
  const fingerprint = [
    receiptScope.pluginInstallationId,
    receiptScope.identityEpoch,
    receiptScope.inputVersion,
    receiptScope.frontierHash,
  ].map((part) => sanitizeReceiptPart(part).slice(0, 48)).join(':');
  const migrationId = `${STARTUP_STORAGE_MAINTENANCE_RECEIPT_VERSION}:${STARTUP_STORAGE_MAINTENANCE_KIND}:${fingerprint}`;
  return {
    operationId: migrationId,
    migrationId,
  };
}

async function readPostSuccessReceiptScope(
  options: StartupWorkerStorageMaintenanceOptions,
  preSuccessScope: StartupMaintenanceReceiptScope,
): Promise<StartupMaintenanceReceiptScope | null> {
  const status = await readReceiptStatus(
    options,
    createReceiptDescriptor(preSuccessScope),
    'post-success',
  );
  return normalizeReceiptScope(status?.currentFrontier);
}

function isCompletedReceiptMatch(
  status: BackendStorageMaintenanceStatusResult | null,
  receipt: BackendStorageMaintenanceStatusRequest | null,
  receiptScope: StartupMaintenanceReceiptScope | null,
): boolean {
  if (!status || !receipt || !receiptScope) {
    return false;
  }
  return status.operationId === receipt.operationId
    && status.migrationId === receipt.migrationId
    && status.status === 'completed'
    && status.required === false
    && isReceiptScopeEqual(normalizeReceiptScope(status.currentFrontier), receiptScope);
}

function normalizeReceiptScope(
  frontier: BackendStorageMaintenanceFrontier | null | undefined,
): StartupMaintenanceReceiptScope | null {
  if (
    !frontier?.pluginInstallationId
    || !frontier.identityEpoch
    || !frontier.inputVersion
    || !frontier.frontierHash
  ) {
    return null;
  }
  return {
    pluginInstallationId: frontier.pluginInstallationId,
    identityEpoch: frontier.identityEpoch,
    inputVersion: frontier.inputVersion,
    frontierHash: frontier.frontierHash,
    externalInputDirtyGeneration: frontier.externalInputDirtyGeneration,
    pendingExternalMerge: frontier.pendingExternalMerge,
  };
}

function isReceiptScopeEqual(
  left: StartupMaintenanceReceiptScope | null,
  right: StartupMaintenanceReceiptScope,
): boolean {
  return left?.pluginInstallationId === right.pluginInstallationId
    && left.identityEpoch === right.identityEpoch
    && left.inputVersion === right.inputVersion
    && left.frontierHash === right.frontierHash
    && left.externalInputDirtyGeneration === right.externalInputDirtyGeneration
    && left.pendingExternalMerge === right.pendingExternalMerge;
}

function toBackendFrontier(
  scope: StartupMaintenanceReceiptScope,
): BackendStorageMaintenanceFrontier {
  return {
    ...scope,
    recoveryStatus: null,
    journalSequenceFrontier: null,
    truthCoverageFrontier: null,
    externalInputDirtyGeneration: scope.externalInputDirtyGeneration,
    pendingExternalMerge: scope.pendingExternalMerge,
  };
}

function sanitizeReceiptPart(value: string): string {
  return String(value || '').trim().replace(/[^a-zA-Z0-9._:-]/g, '_');
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function emptyScheduleDiagnostics(): StartupWorkerStorageMaintenanceDiagnostics['schedule'] {
  return {
    migratedLegacySchedulerCount: 0,
    normalizedMalformedScheduleCount: 0,
    affectedCardCount: 0,
    completedBatches: 0,
    totalBatches: 0,
  };
}

function startupMaintenancePhaseClassifications(): StartupWorkerStorageMaintenanceDiagnostics['phaseClassifications'] {
  return {
    scheduleNormalization: 'deferred-safe',
    orphanCardRepair: 'deferred-safe',
  };
}

function emptyOrphanRepairDiagnostics(): StartupWorkerStorageMaintenanceDiagnostics['orphanRepair'] {
  return {
    discoveredCardCount: 0,
    repairedCardCount: 0,
    completedBatches: 0,
    totalBatches: 0,
  };
}

async function normalizeSchedules(
  options: StartupWorkerStorageMaintenanceOptions,
  operationId: string,
): Promise<StartupWorkerStorageMaintenanceDiagnostics['schedule']> {
  const rollbackSnapshot = options.storage.getStoreData();
  const beforeCards = new Map(
    options.storage.getAllCards().map((card) => [card.id, JSON.stringify(card)]),
  );
  const migratedLegacySchedulerCount = options.storage.migrateLegacyFSRSV5SchedulerType();
  const normalizedMalformedScheduleCount = options.storage.normalizeMalformedReviewScheduling();
  const changedCards = options.storage.getAllCards()
    .filter((card) => beforeCards.get(card.id) !== JSON.stringify(card))
    .sort((left, right) => left.id.localeCompare(right.id));
  const batches = chunk(changedCards, SCHEDULE_BATCH_SIZE);

  try {
    for (let batchIndex = 0; batchIndex < batches.length; batchIndex += 1) {
      const cards = batches[batchIndex];
      const mutationId = createStableBatchMutationId(
        operationId,
        'schedule-normalization',
        batchIndex,
        cards.map((card) => card.id),
      );
      const result = await options.executeScheduleBatch({
        mutationId,
        schedulingWriteSource: 'scheduler-migration',
        cards,
      });
      assertScheduleReceipt(result, mutationId);
      logger.info('Worker startup schedule maintenance progress', {
        operationId,
        completedBatches: batchIndex + 1,
        totalBatches: batches.length,
        affectedCardCount: changedCards.length,
      });
    }
  } catch (error) {
    options.storage.restoreStoreSnapshot(rollbackSnapshot);
    throw error;
  }

  return {
    migratedLegacySchedulerCount,
    normalizedMalformedScheduleCount,
    affectedCardCount: changedCards.length,
    completedBatches: batches.length,
    totalBatches: batches.length,
  };
}

async function repairOrphanCards(
  options: StartupWorkerStorageMaintenanceOptions,
): Promise<StartupWorkerStorageMaintenanceDiagnostics['orphanRepair']> {
  const orphanCards = options.storage.getAllCards()
    .filter((card) => !readCardXiuyuanId(card))
    .sort((left, right) => left.id.localeCompare(right.id));
  const batches = chunk(orphanCards, ORPHAN_REPAIR_BATCH_SIZE);
  let repairedCardCount = 0;

  for (let batchIndex = 0; batchIndex < batches.length; batchIndex += 1) {
    repairedCardCount += options.saveOrphanBatch
      ? await options.saveOrphanBatch(options.storage, batches[batchIndex])
      : await saveOrphanBatch(options.storage, batches[batchIndex]);
    logger.info('Worker orphan-card repair progress', {
      operationId: 'startup-orphan-card-repair-v1',
      completedBatches: batchIndex + 1,
      totalBatches: batches.length,
      repairedCardCount,
      discoveredCardCount: orphanCards.length,
    });
  }

  return {
    discoveredCardCount: orphanCards.length,
    repairedCardCount,
    completedBatches: batches.length,
    totalBatches: batches.length,
  };
}

function readCardXiuyuanId(card: FSRSCard): string | null {
  const topLevel = String(card.xiuyuanID || '').trim();
  if (topLevel) {
    return topLevel;
  }
  const meta = card.meta && typeof card.meta === 'object'
    ? card.meta as Record<string, unknown>
    : null;
  const metaValue = String(meta?.xiuyuanID || '').trim();
  return metaValue || null;
}

async function saveOrphanBatch(
  storage: UnifiedStorageManager,
  orphanCards: FSRSCard[],
): Promise<number> {
  const {
    XiuyuanId,
    BlockId,
    TemplateId,
    Priority,
    CardFace,
    Xiuyuan,
    CardId,
    ScheduleInfo,
    Card,
  } = await loadXiuyuanDomain();
  const repairedXiuyuans = [];

  for (const orphanCard of orphanCards) {
    const xiuyuanIdResult = XiuyuanId.create(`xy_migrated_${orphanCard.id}`);
    const blockIdResult = BlockId.create(orphanCard.blockId);
    const templateIdResult = TemplateId.create('builtin-riff-sync');
    const priorityResult = Priority.create(orphanCard.priority || 50);
    const cardFaceResult = CardFace.create({
      question: `Card ${orphanCard.id}`,
      answer: '',
      questionBlockId: orphanCard.blockId,
      answerBlockId: orphanCard.blockId,
    });
    if (!xiuyuanIdResult.ok || !blockIdResult.ok || !templateIdResult.ok || !cardFaceResult.ok) {
      throw new Error(`INVALID_MAINTENANCE_INPUT: cannot create Xiuyuan values for ${orphanCard.id}`);
    }

    const xiuyuanResult = Xiuyuan.create({
      id: xiuyuanIdResult.value,
      blockIDs: [blockIdResult.value],
      templateID: templateIdResult.value,
      faces: [cardFaceResult.value],
      priority: priorityResult.ok ? priorityResult.value : Priority.createDefault(),
      meta: { schedulerType: 'fsrs-v6' },
    });
    const cardIdResult = CardId.create(orphanCard.id);
    const scheduleInfoResult = ScheduleInfo.create({
      due: new Date(orphanCard.due),
      stability: orphanCard.stability,
      difficulty: orphanCard.difficulty,
      reps: orphanCard.reps,
      lapses: orphanCard.lapses,
      state: orphanCard.state,
      lastReview: new Date(orphanCard.lastReview || Date.now()),
      elapsedDays: orphanCard.elapsedDays || 0,
      scheduledDays: orphanCard.scheduledDays || 0,
      learning_step: 0,
    });
    if (!xiuyuanResult.ok || !cardIdResult.ok || !scheduleInfoResult.ok) {
      throw new Error(`INVALID_MAINTENANCE_INPUT: cannot create orphan repair aggregate for ${orphanCard.id}`);
    }
    const cardResult = Card.create({
      id: cardIdResult.value,
      xiuyuanId: xiuyuanIdResult.value,
      faceIndex: 0,
      scheduleInfo: scheduleInfoResult.value,
      createdAt: new Date(orphanCard.createdAt || Date.now()),
      updatedAt: new Date(orphanCard.updatedAt || Date.now()),
    });
    if (!cardResult.ok) {
      throw new Error(`INVALID_MAINTENANCE_INPUT: cannot create orphan repair card for ${orphanCard.id}`);
    }
    const addResult = xiuyuanResult.value.addCard(cardResult.value);
    if (!addResult.ok) {
      throw new Error(`INVALID_MAINTENANCE_INPUT: cannot attach orphan repair card ${orphanCard.id}`);
    }
    repairedXiuyuans.push(xiuyuanResult.value);
  }

  const repository = new XiuyuanRepository(storage);
  const saveResult = await repository.saveMany(repairedXiuyuans);
  if (isErr(saveResult)) {
    throw saveResult.error;
  }
  return repairedXiuyuans.length;
}

async function loadXiuyuanDomain() {
  const [
    { XiuyuanId },
    { BlockId },
    { TemplateId },
    { Priority },
    { CardFace },
    { Xiuyuan },
    { CardId },
    { ScheduleInfo },
    { Card },
  ] = await Promise.all([
    import('@/core/xiuyuan/domain/XiuyuanId'),
    import('@/core/xiuyuan/domain/BlockId'),
    import('@/core/xiuyuan/domain/TemplateId'),
    import('@/core/xiuyuan/domain/Priority'),
    import('@/core/xiuyuan/domain/CardFace'),
    import('@/core/xiuyuan/domain/Xiuyuan'),
    import('@/core/xiuyuan/domain/CardId'),
    import('@/core/xiuyuan/domain/ScheduleInfo'),
    import('@/core/xiuyuan/domain/Card'),
  ]);
  return { XiuyuanId, BlockId, TemplateId, Priority, CardFace, Xiuyuan, CardId, ScheduleInfo, Card };
}

function assertScheduleReceipt(
  result: BackendCardScheduleBatchUpdateResult,
  mutationId: string,
): void {
  const receipt = result.durabilityReceipt;
  if (
    receipt.mutationId !== mutationId
    || receipt.family !== 'card-schedule'
    || (receipt.stage !== 'journaled' && receipt.stage !== 'truth-committed')
  ) {
    throw new Error('STORAGE_JOURNAL_FAILED: startup schedule maintenance returned invalid receipt');
  }
}

function createStableBatchMutationId(
  operationId: string,
  family: string,
  batchIndex: number,
  aggregateIds: string[],
): string {
  const firstId = aggregateIds[0] ?? 'empty';
  const lastId = aggregateIds[aggregateIds.length - 1] ?? 'empty';
  return `maintenance:${operationId}:${family}:${batchIndex}:${aggregateIds.length}:${firstId}:${lastId}`;
}

function chunk<T>(items: T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    batches.push(items.slice(index, index + size));
  }
  return batches;
}
