export interface BrowserGridSizingInput {
  mobileMode: boolean;
}

export interface BrowserGridSizing {
  cacheBlockSize: number;
  maxBlocksInCache: number;
  pageSize: number;
  rowBuffer: number;
}

const DESKTOP_GRID_PAGE_SIZE = 32;
const DESKTOP_GRID_MAX_BLOCKS = 6;
const MOBILE_GRID_PAGE_SIZE = 120;
const MOBILE_GRID_MAX_BLOCKS = 4;
const GRID_ROW_BUFFER = 6;

export function resolveBrowserGridSizing(input: BrowserGridSizingInput): BrowserGridSizing {
  if (input.mobileMode) {
    return {
      cacheBlockSize: MOBILE_GRID_PAGE_SIZE,
      maxBlocksInCache: MOBILE_GRID_MAX_BLOCKS,
      pageSize: MOBILE_GRID_PAGE_SIZE,
      rowBuffer: GRID_ROW_BUFFER,
    };
  }

  return {
    cacheBlockSize: DESKTOP_GRID_PAGE_SIZE,
    maxBlocksInCache: DESKTOP_GRID_MAX_BLOCKS,
    pageSize: DESKTOP_GRID_PAGE_SIZE,
    rowBuffer: GRID_ROW_BUFFER,
  };
}
