export interface AISiyuanBlockRow extends Record<string, unknown> {
  id: string;
  parent_id?: string;
  root_id?: string;
  type?: string;
  subtype?: string;
  content?: string;
  markdown?: string;
  hpath?: string;
  box?: string;
  path?: string;
}

export interface AISiyuanNotebookConf {
  name: string;
  closed: boolean;
  refCreateSavePath: string;
  createDocNameTemplate: string;
  dailyNoteSavePath: string;
  dailyNoteTemplatePath: string;
}

export interface AISiyuanNotebookSummary {
  id: string;
  name: string;
  icon?: string;
  closed: boolean;
}

export interface AISiyuanMutationOperation {
  action?: string;
  data?: string;
  id?: string;
  parentID?: string;
  previousID?: string;
  retData?: unknown;
}

export interface AISiyuanMutationResult {
  doOperations: AISiyuanMutationOperation[];
}

export interface AISiyuanPort {
  listNotebooks(): Promise<AISiyuanNotebookSummary[]>;
  sql<TRow extends Record<string, unknown> = Record<string, unknown>>(stmt: string): Promise<TRow[]>;
  getBlockText(blockId: string): Promise<string>;
  copyStdMarkdown(blockId: string): Promise<string>;
  ensureTodayDailyNote(notebook: string): Promise<string>;
  setBlockAttrs(blockId: string, attrs: Record<string, string>): Promise<void>;
  getNotebookConf(notebook: string): Promise<AISiyuanNotebookConf>;
  renderTemplate(template: string): Promise<string>;
  createDocWithMarkdown(notebook: string, path: string, markdown: string): Promise<string>;
  insertBlockAfter(markdown: string, previousId: string): Promise<string>;
  insertBlockAfterDetailed(markdown: string, previousId: string): Promise<AISiyuanMutationResult>;
  appendBlockUnderParent(markdown: string, parentId: string): Promise<string>;
  appendBlockUnderParentDetailed(markdown: string, parentId: string): Promise<AISiyuanMutationResult>;
  updateBlockMarkdown(blockId: string, markdown: string): Promise<string>;
  deleteBlock(blockId: string): Promise<void>;
}
