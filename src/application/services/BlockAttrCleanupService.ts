import { XiuyuanId } from '@/core/xiuyuan/domain/XiuyuanId';
import type { UnifiedStorageManager } from '@/core/storage/UnifiedStorageManager';
import { createLogger } from '@/utils/logger';
import {
  ALL_PLUGIN_BLOCK_ATTR_KEYS,
  type BlockAttrCleanupMode,
  shouldRemoveAttrForMode,
} from './BlockAttrPolicy';
import type { HostBlockQueryPort } from '@/application/ports/HostBlockQueryPort';

const logger = createLogger('BlockAttrCleanupService');

type AttrSqlRow = {
  block_id?: unknown;
  name?: unknown;
  value?: unknown;
};

type CleanupPlan = {
  blockId: string;
  attrsToClear: Record<string, string>;
  staleXiuyuanBinding: boolean;
};

type SyncLockPort = {
  runWithGlobalSyncLock<T>(operation: () => Promise<T>): Promise<T>;
};

type CleanupSiyuanPort = {
  setBlockAttrs(blockId: string, attrs: Record<string, string>): Promise<void>;
};

export interface CleanupScanResult {
  totalBlocks: number;
  removableBlocks: number;
  attrCounts: Record<string, number>;
  staleXiuyuanCount: number;
  skippedTreeNotFoundCount: number;
}

export interface CleanupRunResult extends CleanupScanResult {
  mode: BlockAttrCleanupMode;
  cleanedBlocks: number;
  cleanedAttrs: number;
}

export class BlockAttrCleanupService {
  constructor(
    private readonly siyuanApi: CleanupSiyuanPort,
    private readonly blockQuery: Pick<HostBlockQueryPort, 'getManagedBlockAttrs'>,
    private readonly unifiedStorage: UnifiedStorageManager,
    private readonly syncLock?: SyncLockPort
  ) {}

  async scan(mode: BlockAttrCleanupMode): Promise<CleanupScanResult> {
    return this.withLock(async () => {
      const { result } = await this.evaluate(mode);
      return result;
    });
  }

  async run(mode: BlockAttrCleanupMode): Promise<CleanupRunResult> {
    return this.withLock(async () => {
      const { plans, result } = await this.evaluate(mode);

      let cleanedBlocks = 0;
      let cleanedAttrs = 0;
      let skippedTreeNotFoundCount = 0;

      for (const plan of plans) {
        try {
          await this.siyuanApi.setBlockAttrs(plan.blockId, plan.attrsToClear);
          cleanedBlocks += 1;
          cleanedAttrs += Object.keys(plan.attrsToClear).length;
        } catch (error) {
          if (this.isTreeNotFoundError(error)) {
            skippedTreeNotFoundCount += 1;
            logger.info('Skip cleanup for removed tree block', {
              blockId: plan.blockId,
            });
            continue;
          }
          logger.warn('Failed to clear block attrs during cleanup', {
            blockId: plan.blockId,
            error,
          });
        }
      }

      return {
        ...result,
        mode,
        cleanedBlocks,
        cleanedAttrs,
        skippedTreeNotFoundCount,
      };
    });
  }

  private async withLock<T>(operation: () => Promise<T>): Promise<T> {
    if (this.syncLock) {
      return this.syncLock.runWithGlobalSyncLock(operation);
    }
    return operation();
  }

  private async evaluate(mode: BlockAttrCleanupMode): Promise<{ plans: CleanupPlan[]; result: CleanupScanResult }> {
    const rows = await this.queryManagedAttrs();
    const attrsByBlock = new Map<string, Record<string, string>>();

    for (const row of rows) {
      const blockId = this.toTrimmedString(row.block_id);
      const attrName = this.toTrimmedString(row.name);
      if (!blockId || !attrName) {
        continue;
      }
      const attrValue = typeof row.value === 'string' ? row.value : '';
      const currentAttrs = attrsByBlock.get(blockId) ?? {};
      currentAttrs[attrName] = attrValue;
      attrsByBlock.set(blockId, currentAttrs);
    }

    const attrCounts: Record<string, number> = {};
    const plans: CleanupPlan[] = [];
    let staleXiuyuanCount = 0;

    for (const [blockId, attrs] of attrsByBlock.entries()) {
      const staleXiuyuanBinding = this.isStaleXiuyuanBinding(attrs);
      if (staleXiuyuanBinding) {
        staleXiuyuanCount += 1;
      }

      const attrsToClear: Record<string, string> = {};
      for (const attrName of Object.keys(attrs)) {
        if (!shouldRemoveAttrForMode(mode, attrName, { staleXiuyuanBinding })) {
          continue;
        }
        attrsToClear[attrName] = '';
        attrCounts[attrName] = (attrCounts[attrName] || 0) + 1;
      }

      if (Object.keys(attrsToClear).length > 0) {
        plans.push({
          blockId,
          attrsToClear,
          staleXiuyuanBinding,
        });
      }
    }

    return {
      plans,
      result: {
        totalBlocks: attrsByBlock.size,
        removableBlocks: plans.length,
        attrCounts,
        staleXiuyuanCount,
        skippedTreeNotFoundCount: 0,
      },
    };
  }

  private async queryManagedAttrs(): Promise<AttrSqlRow[]> {
    const rows = await this.blockQuery.getManagedBlockAttrs(ALL_PLUGIN_BLOCK_ATTR_KEYS);
    return Array.isArray(rows) ? (rows as AttrSqlRow[]) : [];
  }

  private isStaleXiuyuanBinding(attrs: Record<string, string>): boolean {
    const rawBinding = this.toTrimmedString(attrs['custom-xiuyuan-id']);
    if (!rawBinding) {
      return false;
    }

    const idResult = XiuyuanId.create(rawBinding);
    if (!idResult.ok) {
      return true;
    }

    const existing = this.unifiedStorage.getXiuYuan(rawBinding);
    return !existing;
  }

  private toTrimmedString(value: unknown): string {
    if (typeof value !== 'string') {
      return '';
    }
    return value.trim();
  }

  private isTreeNotFoundError(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);
    return message.includes('tree not found');
  }
}

