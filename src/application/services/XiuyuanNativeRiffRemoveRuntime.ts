import { BlockId } from '@/core/xiuyuan/domain/BlockId';
import type { Result } from '@/types/result';

type XiuyuanIdentity = {
  getId: () => {
    getValue: () => string;
  };
};

export interface XiuyuanNativeRiffRemovePlan<TXiuyuan extends XiuyuanIdentity> {
  deletes: Array<{
    blockId: string;
    xiuyuanEntity: TXiuyuan;
  }>;
  skippedCount: number;
}

export interface XiuyuanNativeRiffRemoveRuntimeDeps<TXiuyuan extends XiuyuanIdentity> {
  findByBlockId: (blockId: BlockId) => Promise<Result<TXiuyuan[]>>;
  isManagedRiffXiuyuan: (xiuyuan: TXiuyuan) => boolean;
  warn: (message: string, payload?: Record<string, unknown>) => void;
}

export class XiuyuanNativeRiffRemoveRuntime<TXiuyuan extends XiuyuanIdentity> {
  constructor(private readonly deps: XiuyuanNativeRiffRemoveRuntimeDeps<TXiuyuan>) {}

  async planRemovals(blockIds: string[]): Promise<XiuyuanNativeRiffRemovePlan<TXiuyuan>> {
    const deletes: XiuyuanNativeRiffRemovePlan<TXiuyuan>['deletes'] = [];
    let skippedCount = 0;
    const normalizedBlockIds = Array.from(new Set(
      blockIds
        .map((blockId) => String(blockId || '').trim())
        .filter((blockId): blockId is string => Boolean(blockId)),
    ));
    const seenXiuyuanIds = new Set<string>();

    for (const blockId of normalizedBlockIds) {
      const blockIdResult = BlockId.create(blockId);
      if (!blockIdResult.ok) {
        skippedCount++;
        this.deps.warn('[XiuyuanSyncService] Skip native riff remove for invalid block id', { blockId });
        continue;
      }

      const xiuyuansResult = await this.deps.findByBlockId(blockIdResult.value);
      if (!xiuyuansResult.ok) {
        skippedCount++;
        this.deps.warn('[XiuyuanSyncService] Failed to inspect local Xiuyuan state for native riff remove', {
          blockId,
          error: xiuyuansResult.error,
        });
        continue;
      }

      const managedXiuyuans = xiuyuansResult.value.filter((xiuyuan) => this.deps.isManagedRiffXiuyuan(xiuyuan));
      if (managedXiuyuans.length === 0) {
        skippedCount++;
        continue;
      }

      for (const xiuyuan of managedXiuyuans) {
        const xiuyuanId = xiuyuan.getId().getValue();
        if (seenXiuyuanIds.has(xiuyuanId)) {
          continue;
        }
        seenXiuyuanIds.add(xiuyuanId);
        deletes.push({
          blockId,
          xiuyuanEntity: xiuyuan,
        });
      }
    }

    return {
      deletes,
      skippedCount,
    };
  }
}
