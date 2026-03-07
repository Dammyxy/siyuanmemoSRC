import type { BreadcrumbItem } from '@/core/card/common/application/types';
import { normalizeRawBreadcrumbs } from '@/core/card/common/application/breadcrumbNormalization';
import { getBlockBreadcrumb } from '@/infrastructure/siyuan/api';

export interface LoadBreadcrumbTrailOptions {
  trimTrailingCount?: number;
  clipAtLastDocument?: boolean;
}

export async function loadBreadcrumbTrail(
  blockId: string,
  options: LoadBreadcrumbTrailOptions = {},
): Promise<BreadcrumbItem[]> {
  if (!blockId) {
    return [];
  }

  const rawBreadcrumbs = await getBlockBreadcrumb(blockId);
  return normalizeRawBreadcrumbs(rawBreadcrumbs, {
    trimTrailingCount: options.trimTrailingCount ?? 1,
    clipAtLastDocument: options.clipAtLastDocument ?? false,
  });
}
