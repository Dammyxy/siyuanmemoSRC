import { err, ok, Result } from '@/types/result';
import type { IXiuyuanRepository } from '@/core/xiuyuan/domain/repositories/IXiuyuanRepository';

/**
 * Ensure the in-memory card -> xiuyuan index is rebuilt from current storage snapshot.
 * Delete flows depend on this index for deterministic single-path lookup.
 */
export async function warmupXiuyuanCardIndex(
  xiuyuanRepo: IXiuyuanRepository
): Promise<Result<void>> {
  const xiuyuansResult = await xiuyuanRepo.findAll();
  if (!xiuyuansResult.ok) {
    const error = xiuyuansResult.error ?? new Error('Failed to warm up Xiuyuan card index');
    return err(error);
  }

  return ok(undefined);
}
