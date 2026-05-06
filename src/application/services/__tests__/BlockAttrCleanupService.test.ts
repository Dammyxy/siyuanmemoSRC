import { describe, expect, it, vi } from 'vitest';
import type { UnifiedStorageManager } from '@/core/storage/UnifiedStorageManager';
import { BlockAttrCleanupService } from '../BlockAttrCleanupService';

type AttrRow = {
  block_id: string;
  name: string;
  value: string;
};

function createHarness(options: {
  rows: AttrRow[];
  existingXiuyuanIds?: string[];
  setBlockAttrsImpl?: (blockId: string, attrs: Record<string, string>) => Promise<void>;
  withSyncLock?: boolean;
}) {
  const getManagedBlockAttrs = vi.fn(async () => options.rows);
  const setBlockAttrs = vi.fn(
    options.setBlockAttrsImpl ?? (async () => undefined)
  );
  const existingIds = new Set(options.existingXiuyuanIds ?? []);
  const getXiuYuan = vi.fn((id: string) => (existingIds.has(id) ? { id } : null));

  const syncLock = options.withSyncLock
    ? {
        runWithGlobalSyncLock: vi.fn(async <T>(operation: () => Promise<T>) => operation()),
      }
    : undefined;

  const service = new BlockAttrCleanupService(
    { setBlockAttrs },
    { getManagedBlockAttrs },
    { getXiuYuan } as unknown as UnifiedStorageManager,
    syncLock
  );

  return {
    service,
    getManagedBlockAttrs,
    setBlockAttrs,
    getXiuYuan,
    syncLock,
  };
}

describe('BlockAttrCleanupService', () => {
  it('scan(safe) counts removable attrs and stale bindings while preserving functional attrs', async () => {
    const validXiuyuanId = 'xy_20260305010958-r26fpmd';
    const staleXiuyuanId = 'xy_20260305010958-mww4lsd';
    const harness = createHarness({
      rows: [
        { block_id: 'block-1', name: 'custom-fsrs-card-type', value: 'concept' },
        { block_id: 'block-1', name: 'custom-xiuyuan-id', value: validXiuyuanId },
        { block_id: 'block-2', name: 'custom-xiuyuan-id', value: staleXiuyuanId },
        { block_id: 'block-3', name: 'custom-fsrs-image-occlusion', value: '{"masks":[]}' },
      ],
      existingXiuyuanIds: [validXiuyuanId],
      withSyncLock: true,
    });

    const result = await harness.service.scan('safe');

    expect(result.totalBlocks).toBe(3);
    expect(result.removableBlocks).toBe(2);
    expect(result.staleXiuyuanCount).toBe(1);
    expect(result.skippedTreeNotFoundCount).toBe(0);
    expect(result.attrCounts).toEqual({
      'custom-fsrs-card-type': 1,
      'custom-xiuyuan-id': 1,
    });
    expect(harness.syncLock?.runWithGlobalSyncLock).toHaveBeenCalledTimes(1);
  });

  it('run(safe) skips tree-not-found blocks and continues cleanup', async () => {
    const staleXiuyuanId = 'xy_20260305010958-gpb0x2u';
    const harness = createHarness({
      rows: [
        { block_id: 'block-1', name: 'custom-fsrs-card-type', value: 'descriptor' },
        { block_id: 'block-2', name: 'custom-xiuyuan-id', value: staleXiuyuanId },
      ],
      setBlockAttrsImpl: async (blockId) => {
        if (blockId === 'block-2') {
          throw new Error('Siyuan API Error: tree not found');
        }
      },
    });

    const result = await harness.service.run('safe');

    expect(result.mode).toBe('safe');
    expect(result.totalBlocks).toBe(2);
    expect(result.removableBlocks).toBe(2);
    expect(result.cleanedBlocks).toBe(1);
    expect(result.cleanedAttrs).toBe(1);
    expect(result.skippedTreeNotFoundCount).toBe(1);
    expect(harness.setBlockAttrs).toHaveBeenCalledTimes(2);
    expect(harness.setBlockAttrs).toHaveBeenCalledWith('block-1', {
      'custom-fsrs-card-type': '',
    });
    expect(harness.setBlockAttrs).toHaveBeenCalledWith('block-2', {
      'custom-xiuyuan-id': '',
    });
  });

  it('run(full) clears all managed plugin attrs including binding and functional attrs', async () => {
    const validXiuyuanId = 'xy_20260305010958-1ybusdf';
    const harness = createHarness({
      rows: [
        { block_id: 'block-a', name: 'custom-xiuyuan-id', value: validXiuyuanId },
        { block_id: 'block-a', name: 'custom-fsrs-image-occlusion', value: '{"masks":[]}' },
        { block_id: 'block-a', name: 'custom-fsrs-image-occlusion-version', value: '2' },
        { block_id: 'block-b', name: 'custom-fsrs-leech-suspend', value: 'true' },
      ],
      existingXiuyuanIds: [validXiuyuanId],
    });

    const result = await harness.service.run('full');

    expect(result.mode).toBe('full');
    expect(result.totalBlocks).toBe(2);
    expect(result.removableBlocks).toBe(2);
    expect(result.cleanedBlocks).toBe(2);
    expect(result.cleanedAttrs).toBe(4);
    expect(result.skippedTreeNotFoundCount).toBe(0);
    expect(harness.setBlockAttrs).toHaveBeenCalledWith('block-a', {
      'custom-xiuyuan-id': '',
      'custom-fsrs-image-occlusion': '',
      'custom-fsrs-image-occlusion-version': '',
    });
    expect(harness.setBlockAttrs).toHaveBeenCalledWith('block-b', {
      'custom-fsrs-leech-suspend': '',
    });
  });
});
