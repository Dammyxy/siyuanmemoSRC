import type { XiuyuanSyncRiffBlock as RiffBlock } from '@/application/ports/XiuyuanSyncSiyuanPort';
import type { Xiuyuan } from '@/core/xiuyuan/domain/Xiuyuan';
import { createLogger } from '@/utils/logger';
import type {
  SyncChangeSet,
  SyncType,
} from './XiuyuanSyncService.types';

type RiffInputStage = 'incremental' | 'full';

type LocalOwnedSkipSummary = {
  count: number;
  sampleBlockIds: string[];
};

export interface XiuyuanSyncChangeSetPlannerDeps {
  isManagedRiffXiuyuan: (xiuyuan: Xiuyuan) => boolean;
  isRecentlyDeleted: (blockId: string) => boolean;
  findExistingXiuyuanForBlock: (blockId: string) => Promise<Xiuyuan | null>;
  cloneXiuyuanForSyncPlanning: (xiuyuan: Xiuyuan) => Xiuyuan;
  planManagedXiuyuanMetadataUpdate: (xiuyuan: Xiuyuan, riffCard: RiffBlock) => Promise<boolean>;
  convertRiffCardToXiuyuan: (riffCard: RiffBlock) => Promise<{ xiuyuanEntity: Xiuyuan }>;
  syncXiuyuanOwnershipMeta: (xiuyuan: Xiuyuan, ownership: 'riff-managed') => boolean;
}

const logger = createLogger('XiuyuanSyncChangeSetPlanner');
const LOCAL_OWNED_SKIP_SAMPLE_LIMIT = 5;

export class XiuyuanSyncChangeSetPlanner {
  constructor(private readonly deps: XiuyuanSyncChangeSetPlannerDeps) {}

  createEmptyChangeSet(syncType: SyncType): SyncChangeSet {
    return {
      syncType,
      creates: [],
      metadataUpdates: [],
      deletes: [],
      blacklistCleanup: [],
      postDetectTargets: [],
      stats: {
        addedCount: 0,
        updatedCount: 0,
        deletedCount: 0,
        skippedCount: 0,
        blacklistCleanedCount: 0,
      },
    };
  }

  async planRiffUpserts(input: {
    changeSet: SyncChangeSet;
    riffCards: RiffBlock[];
    stage: RiffInputStage;
  }): Promise<void> {
    const seenBlockIds = new Set<string>();
    const localOwnedSkips = this.createLocalOwnedSkipSummary();

    for (const riffCard of input.riffCards) {
      if (seenBlockIds.has(riffCard.id)) {
        input.changeSet.stats.skippedCount++;
        continue;
      }
      seenBlockIds.add(riffCard.id);

      if (this.deps.isRecentlyDeleted(riffCard.id)) {
        logger.info(`Skipping recently deleted card during ${input.stage} sync: ${riffCard.id}`);
        input.changeSet.stats.skippedCount++;
        continue;
      }

      const existingXiuyuan = await this.deps.findExistingXiuyuanForBlock(riffCard.id);
      if (existingXiuyuan && !this.deps.isManagedRiffXiuyuan(existingXiuyuan)) {
        this.recordLocalOwnedSkip(localOwnedSkips, input.stage, riffCard.id);
        input.changeSet.stats.skippedCount++;
        continue;
      }

      if (existingXiuyuan) {
        const plannedXiuyuan = this.deps.cloneXiuyuanForSyncPlanning(existingXiuyuan);
        const needsUpdate = await this.deps.planManagedXiuyuanMetadataUpdate(plannedXiuyuan, riffCard);
        if (needsUpdate) {
          input.changeSet.metadataUpdates.push({
            blockId: riffCard.id,
            xiuyuanEntity: plannedXiuyuan,
          });
          input.changeSet.stats.updatedCount++;
        } else {
          input.changeSet.stats.skippedCount++;
        }
        continue;
      }

      const { xiuyuanEntity } = await this.deps.convertRiffCardToXiuyuan(riffCard);
      this.deps.syncXiuyuanOwnershipMeta(xiuyuanEntity, 'riff-managed');
      input.changeSet.creates.push({
        blockId: riffCard.id,
        xiuyuanEntity,
      });
      input.changeSet.postDetectTargets.push(riffCard);
      input.changeSet.stats.addedCount++;
    }

    this.logLocalOwnedSkipSummary(input.stage, localOwnedSkips);
  }

  planManagedFullDeletes(input: {
    changeSet: SyncChangeSet;
    allXiuyuans: Xiuyuan[];
    riffBlockIds: Set<string>;
  }): void {
    for (const xiuyuan of input.allXiuyuans) {
      if (!this.deps.isManagedRiffXiuyuan(xiuyuan)) {
        continue;
      }

      const blockId = xiuyuan.getRepresentativeBlockId();
      if (!blockId || input.riffBlockIds.has(blockId)) {
        continue;
      }

      input.changeSet.deletes.push({
        blockId,
        xiuyuanEntity: xiuyuan,
      });
    }

    input.changeSet.stats.deletedCount = input.changeSet.deletes.length;
  }

  private createLocalOwnedSkipSummary(): LocalOwnedSkipSummary {
    return {
      count: 0,
      sampleBlockIds: [],
    };
  }

  private recordLocalOwnedSkip(summary: LocalOwnedSkipSummary, stage: RiffInputStage, blockId: string): void {
    summary.count++;
    if (summary.sampleBlockIds.length >= LOCAL_OWNED_SKIP_SAMPLE_LIMIT) {
      return;
    }

    summary.sampleBlockIds.push(blockId);
    logger.debug('[XiuyuanSyncChangeSetPlanner] Skipping Riff card because local-owned Xiuyuan already exists', {
      stage,
      blockId,
    });
  }

  private logLocalOwnedSkipSummary(stage: RiffInputStage, summary: LocalOwnedSkipSummary): void {
    if (summary.count === 0) {
      return;
    }

    logger.info('[XiuyuanSyncChangeSetPlanner] Skipped Riff cards because local-owned Xiuyuan already exists', {
      stage,
      skippedCount: summary.count,
      sampleBlockIds: summary.sampleBlockIds,
    });
  }
}
