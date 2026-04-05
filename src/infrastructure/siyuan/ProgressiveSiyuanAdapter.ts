import type {
  ProgressiveDocInfo,
  ProgressiveNotebookConf,
  ProgressiveSiyuanPort,
} from '@/application/ports/ProgressiveSiyuanPort';
import {
  appendBlock,
  copyStdMarkdown,
  createDocWithMd,
  deleteBlock,
  getBlockAttrs,
  getBlockKramdown,
  getDocInfo,
  getNotebookConf,
  moveBlock,
  pushErrMsg,
  pushMsg,
  renderSprig,
  setBlockAttrs,
  sql,
} from './api';

function toProgressiveDocInfo(value: Record<string, unknown>): ProgressiveDocInfo {
  return {
    id: String(value.id || ''),
    box: String(value.box || ''),
    path: String(value.path || ''),
    hpath: String(value.hpath || ''),
    name: String(value.name || value.content || ''),
  };
}

export class ProgressiveSiyuanAdapter implements ProgressiveSiyuanPort {
  async pushMsg(msg: string, timeout?: number): Promise<void> {
    await pushMsg(msg, timeout);
  }

  async pushErrMsg(msg: string, timeout?: number): Promise<void> {
    await pushErrMsg(msg, timeout);
  }

  async sql<TRow extends Record<string, unknown> = Record<string, unknown>>(stmt: string): Promise<TRow[]> {
    return sql<TRow>(stmt);
  }

  async getDocInfo(docId: string): Promise<ProgressiveDocInfo> {
    const result = await getDocInfo(docId);
    return toProgressiveDocInfo(result);
  }

  async getBlockAttrs(blockId: string): Promise<Record<string, string>> {
    return getBlockAttrs(blockId);
  }

  async setBlockAttrs(blockId: string, attrs: Record<string, string>): Promise<void> {
    await setBlockAttrs(blockId, attrs);
  }

  async getBlockKramdown(blockId: string): Promise<{ kramdown: string }> {
    return getBlockKramdown(blockId);
  }

  async copyStdMarkdown(blockId: string): Promise<string> {
    return copyStdMarkdown(blockId);
  }

  async createDocWithMarkdown(notebook: string, path: string, markdown: string): Promise<string> {
    return createDocWithMd(notebook, path, markdown);
  }

  async appendMarkdownBlock(parentID: string, markdown: string): Promise<string> {
    return appendBlock({
      dataType: 'markdown',
      data: markdown,
      parentID,
    });
  }

  async appendDomBlock(parentID: string, dom: string): Promise<string> {
    return appendBlock({
      dataType: 'dom',
      data: dom,
      parentID,
    });
  }

  async moveBlockAsChild(blockId: string, parentID: string): Promise<void> {
    await moveBlock({ id: blockId, parentID });
  }

  async deleteBlock(blockId: string): Promise<void> {
    await deleteBlock(blockId);
  }

  async renderTemplate(template: string): Promise<string> {
    return renderSprig(template);
  }

  async getNotebookConf(notebook: string): Promise<ProgressiveNotebookConf> {
    const result = await getNotebookConf(notebook);
    return result.conf;
  }
}
