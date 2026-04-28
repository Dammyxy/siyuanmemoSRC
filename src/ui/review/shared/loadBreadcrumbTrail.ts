import type { BreadcrumbItem } from '@/core/card/common/application/types';
import { normalizeRawBreadcrumbs } from '@/core/card/common/application/breadcrumbNormalization';
import type { ReviewSiyuanPort } from '@/application/ports/ReviewSiyuanPort';

type BreadcrumbSiyuanApi = Pick<ReviewSiyuanPort, 'getBlockBreadcrumb'>;

export interface LoadBreadcrumbTrailOptions {
  siyuanApi: BreadcrumbSiyuanApi;
  trimTrailingCount?: number;
  clipAtLastDocument?: boolean;
}

export async function loadBreadcrumbTrail(
  blockId: string,
  options: LoadBreadcrumbTrailOptions,
): Promise<BreadcrumbItem[]> {
  if (!blockId) {
    return [];
  }

  const rawBreadcrumbs = await options.siyuanApi.getBlockBreadcrumb(blockId);
  return normalizeRawBreadcrumbs(rawBreadcrumbs, {
    trimTrailingCount: options.trimTrailingCount ?? 1,
    clipAtLastDocument: options.clipAtLastDocument ?? false,
  });
}
