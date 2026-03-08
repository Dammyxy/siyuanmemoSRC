import type { IXiuyuanRepository } from '@/core/xiuyuan/domain/repositories/IXiuyuanRepository';
import type { Xiuyuan } from '@/core/xiuyuan/domain/Xiuyuan';
import type { Result } from '@/types/result';

export async function persistXiuyuanAfterCardDeletion(
  xiuyuanRepo: IXiuyuanRepository,
  xiuyuan: Xiuyuan
): Promise<Result<void>> {
  if (xiuyuan.getCards().length === 0) {
    return xiuyuanRepo.delete(xiuyuan);
  }

  return xiuyuanRepo.save(xiuyuan);
}
