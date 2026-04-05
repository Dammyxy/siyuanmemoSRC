export interface ProgressiveDocInfo {
  id: string;
  box: string;
  path: string;
  hpath: string;
  name: string;
}

export interface ProgressiveNotebookConf {
  name: string;
  closed: boolean;
  refCreateSavePath: string;
  createDocNameTemplate: string;
  dailyNoteSavePath: string;
  dailyNoteTemplatePath: string;
}

export interface ProgressiveBlockRow {
  id: string;
  root_id?: string;
  parent_id?: string;
  box?: string;
  type?: string;
  subtype?: string;
  content?: string;
  markdown?: string;
  sort?: string;
}

export interface ProgressiveSiyuanPort {
  pushMsg(msg: string, timeout?: number): Promise<void>;
  pushErrMsg(msg: string, timeout?: number): Promise<void>;
  sql<TRow extends Record<string, unknown> = Record<string, unknown>>(stmt: string): Promise<TRow[]>;
  getDocInfo(docId: string): Promise<ProgressiveDocInfo>;
  getBlockAttrs(blockId: string): Promise<Record<string, string>>;
  setBlockAttrs(blockId: string, attrs: Record<string, string>): Promise<void>;
  getBlockKramdown(blockId: string): Promise<{ kramdown: string }>;
  copyStdMarkdown(blockId: string): Promise<string>;
  createDocWithMarkdown(notebook: string, path: string, markdown: string): Promise<string>;
  appendMarkdownBlock(parentID: string, markdown: string): Promise<string>;
  appendDomBlock(parentID: string, dom: string): Promise<string>;
  moveBlockAsChild(blockId: string, parentID: string): Promise<void>;
  deleteBlock(blockId: string): Promise<void>;
  renderTemplate(template: string): Promise<string>;
  getNotebookConf(notebook: string): Promise<ProgressiveNotebookConf>;
}
