export interface BrowserPreviewNotebookSummary {
  id?: unknown;
  name?: unknown;
}

export interface BrowserPreviewDocInfo {
  box?: unknown;
  path?: unknown;
}

export interface BrowserPreviewDocumentBreadcrumbRow extends Record<string, unknown> {
  id?: unknown;
  content?: unknown;
  hpath?: unknown;
  path?: unknown;
  type?: unknown;
}

export interface BrowserPreviewSiyuanPort {
  getBlockBreadcrumb(blockId: string): Promise<Record<string, unknown>[]>;
  getDocInfo(docId: string): Promise<BrowserPreviewDocInfo | null>;
  getDocumentBreadcrumbRowsByPaths(
    box: string,
    ancestorPaths: string[],
  ): Promise<BrowserPreviewDocumentBreadcrumbRow[]>;
  listNotebooks(): Promise<BrowserPreviewNotebookSummary[]>;
}
