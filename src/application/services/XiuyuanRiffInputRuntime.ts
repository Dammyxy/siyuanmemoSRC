import type { XiuyuanSyncRiffBlock as RiffBlock } from '@/application/ports/XiuyuanSyncSiyuanPort';
import { BlockId } from '@/core/xiuyuan/domain/BlockId';
import { normalizeBlockId } from '@/core/siyuan/riff/normalizers';

export type XiuyuanRiffInputStage = 'legacy-card-type-migration' | 'incremental' | 'full';

export interface PreparedRiffBlocks {
  blocks: RiffBlock[];
  skippedCount: number;
}

export interface XiuyuanRiffInputRuntimeDeps {
  warn: (message: string, payload?: Record<string, unknown>) => void;
}

export class XiuyuanRiffInputRuntime {
  constructor(private readonly deps: XiuyuanRiffInputRuntimeDeps) {}

  prepareRiffBlocks(stage: XiuyuanRiffInputStage, riffBlocks: RiffBlock[]): PreparedRiffBlocks {
    const preparedBlocks: RiffBlock[] = [];
    let skippedCount = 0;

    for (const riffBlock of riffBlocks) {
      const normalizedId = String(normalizeBlockId(riffBlock) || '').trim();
      const blockIdResult = BlockId.create(normalizedId);
      if (!blockIdResult.ok) {
        skippedCount++;
        const errorMsg = blockIdResult.ok === false ? blockIdResult.error.message : 'Invalid BlockId';
        this.logMalformedRiffBlock(stage, riffBlock, errorMsg);
        continue;
      }

      if (!this.hasMeaningfulRiffQuestion(riffBlock.content)) {
        skippedCount++;
        this.logMalformedRiffBlock(stage, riffBlock, 'Question cannot be empty');
        continue;
      }

      if (normalizedId === riffBlock.id) {
        preparedBlocks.push(riffBlock);
        continue;
      }

      preparedBlocks.push({
        ...riffBlock,
        id: normalizedId,
      });
    }

    if (skippedCount > 0) {
      this.deps.warn('[XiuyuanSyncService] Skipped malformed Riff blocks', {
        stage,
        skippedCount,
      });
    }

    return {
      blocks: preparedBlocks,
      skippedCount,
    };
  }

  normalizeRiffQuestion(content: string | undefined): string {
    if (typeof content !== 'string') {
      return '';
    }

    return content.replace(/\u200B/g, '').trim();
  }

  hasMeaningfulRiffQuestion(content: string | undefined): boolean {
    return this.normalizeRiffQuestion(content).length > 0;
  }

  private logMalformedRiffBlock(stage: XiuyuanRiffInputStage, riffBlock: RiffBlock, reason: string): void {
    const rawRiffBlock = riffBlock as unknown as Record<string, unknown>;
    this.deps.warn('[XiuyuanSyncService] Skipping malformed Riff block', {
      stage,
      reason,
      id: this.readRiffField(rawRiffBlock, 'id'),
      blockID: this.readRiffField(rawRiffBlock, 'blockID'),
      blockId: this.readRiffField(rawRiffBlock, 'blockId'),
      riffCardID: this.readRiffField(rawRiffBlock, 'riffCardID'),
      riffCardId: this.readRiffField(rawRiffBlock, 'riffCardId'),
      path: this.readRiffField(rawRiffBlock, 'path'),
      contentLength: typeof rawRiffBlock.content === 'string' ? rawRiffBlock.content.length : undefined,
    });
  }

  private readRiffField(record: Record<string, unknown>, key: string): string | undefined {
    const value = record[key];
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
  }
}
