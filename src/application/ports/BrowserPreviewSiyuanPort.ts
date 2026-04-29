export interface BrowserPreviewNotebookSummary {
  id?: unknown;
  name?: unknown;
}

export interface BrowserPreviewDocInfo {
  box?: unknown;
  path?: unknown;
}

export interface BrowserPreviewSiyuanPort {
  getBlockBreadcrumb(blockId: string): Promise<Record<string, unknown>[]>;
  getDocInfo(docId: string): Promise<BrowserPreviewDocInfo | null>;
  listNotebooks(): Promise<BrowserPreviewNotebookSummary[]>;
  sql<TRow extends Record<string, unknown> = Record<string, unknown>>(stmt: string): Promise<TRow[]>;
}
