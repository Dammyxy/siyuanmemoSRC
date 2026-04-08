export interface ConfiguredCaptureNotebookSummary {
  id: string;
  name: string;
  icon?: string;
  closed: boolean;
}

export interface ConfiguredCaptureDocInfo {
  id: string;
  box: string;
  path: string;
  hpath: string;
  name: string;
}

export interface ConfiguredCaptureBlockRow extends Record<string, unknown> {
  id: string;
  box?: string;
  root_id?: string;
  type?: string;
  path?: string;
  hpath?: string;
  content?: string;
}

export interface ConfiguredCaptureStoragePort {
  listNotebooks(): Promise<ConfiguredCaptureNotebookSummary[]>;
  sql<TRow extends Record<string, unknown> = Record<string, unknown>>(stmt: string): Promise<TRow[]>;
  getDocInfo(docId: string): Promise<ConfiguredCaptureDocInfo>;
  createDocWithMarkdown(notebook: string, path: string, markdown: string): Promise<string>;
  ensureTodayDailyNote(notebook: string): Promise<string>;
}
