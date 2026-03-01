import { describe, expect, it, vi } from 'vitest';
import { DocumentPostCreationScanService } from '../DocumentPostCreationScanService';

describe('DocumentPostCreationScanService', () => {
  it('prefers paragraph blocks and skips list-item fallback when list item has paragraph child', async () => {
    const sql = vi.fn().mockImplementation(async (stmt: string) => {
      if (stmt.includes('SELECT DISTINCT parent_id')) {
        return [{ parent_id: 'i-1' }];
      }
      return [
        { id: 'i-1', type: 'i' },
        { id: 'p-1', type: 'p' },
      ];
    });

    const getBlockKramdown = vi.fn(async (blockId: string) => {
      if (blockId === 'i-1') return { kramdown: 'List root >>>' };
      return { kramdown: 'Question >> Answer' };
    });

    const executeSingleBlockDecision = vi.fn().mockResolvedValue(true);
    const executeStructuralDecision = vi.fn().mockResolvedValue(true);

    const service = new DocumentPostCreationScanService(
      {
        sql,
        getBlockKramdown,
      },
      {
        executeSingleBlockDecision,
        executeStructuralDecision,
      }
    );

    const summary = await service.scanByRootId('root-1');

    expect(summary.rootId).toBe('root-1');
    expect(summary.scanned).toBe(2);
    expect(summary.created).toBe(1);
    expect(summary.failed).toBe(0);
    expect(summary.skipped).toBe(1);
    expect(summary.consumed).toBe(1);
    expect(executeStructuralDecision).not.toHaveBeenCalled();
    expect(executeSingleBlockDecision).toHaveBeenCalledTimes(1);
    expect(getBlockKramdown).toHaveBeenCalledTimes(1);
    expect(getBlockKramdown).toHaveBeenCalledWith('p-1');
  });

  it('uses list-item fallback when list item has no paragraph child', async () => {
    const sql = vi.fn().mockImplementation(async (stmt: string) => {
      if (stmt.includes('SELECT DISTINCT parent_id')) {
        return [];
      }
      return [
        { id: 'i-1', type: 'i' },
      ];
    });

    const getBlockKramdown = vi.fn().mockResolvedValue({ kramdown: '术语;;描述' });
    const executeSingleBlockDecision = vi.fn().mockResolvedValue(true);
    const executeStructuralDecision = vi.fn().mockResolvedValue(true);

    const service = new DocumentPostCreationScanService(
      {
        sql,
        getBlockKramdown,
      },
      {
        executeSingleBlockDecision,
        executeStructuralDecision,
      }
    );

    const summary = await service.scanByRootId('root-1');

    expect(summary.scanned).toBe(1);
    expect(summary.created).toBe(1);
    expect(summary.skipped).toBe(0);
    expect(executeSingleBlockDecision).toHaveBeenCalledTimes(1);
    expect(getBlockKramdown).toHaveBeenCalledWith('i-1');
  });
});
