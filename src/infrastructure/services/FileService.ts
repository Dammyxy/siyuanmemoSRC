/**
 * FileService - 文件操作服务
 * 
 * @module FileService
 * @description
 * 提供统一的文件读写接口，封装 SiYuan Plugin API 的文件操作。
 * 所有其他服务通过此服务访问文件系统。
 * 
 * **职责**：
 * - 封装插件的 loadData/saveData API
 * - 提供 JSON 和 MessagePack 格式的序列化/反序列化
 * - 处理文件不存在、权限错误等异常情况
 * - 提供统一的错误处理和日志记录
 * 
 * **Validates: Requirements 7.1, 7.2, 7.3, 7.4, 7.5**
 */

import type SiyuanMemoPlugin from '../../index';
import { getPluginDataPath, putFile } from '@/infrastructure/siyuan/api';
import { createLogger } from '@/utils/logger';

const logger = createLogger('FileService');

/**
 * 文件服务接口
 */
export interface IFileService {
  /**
   * 读取插件数据文件
   * @param fileName 文件名（相对于插件数据目录）
   * @returns 文件内容，如果文件不存在返回 null
   */
  readFile(fileName: string): Promise<string | null>;
  
  /**
   * 写入插件数据文件
   * @param fileName 文件名（相对于插件数据目录）
   * @param content 文件内容
   */
  writeFile(fileName: string, content: string): Promise<void>;

  /**
   * 读取二进制插件数据文件
   * @param fileName 文件名（相对于插件数据目录）
   * @returns 二进制内容，如果文件不存在返回 null
   */
  readBinary?(fileName: string): Promise<Uint8Array | null>;

  /**
   * 写入二进制插件数据文件
   * @param fileName 文件名（相对于插件数据目录）
   * @param bytes 二进制内容
   */
  writeBinary?(fileName: string, bytes: Uint8Array): Promise<void>;

  /**
   * Read SiYuan sync conflict copies of the plugin sqlite database.
   */
  readSyncConflictDatabaseSources?(): Promise<Array<{
    sourceId: string;
    bytes: Uint8Array;
    path?: string | null;
    modifiedAt?: number | null;
    size?: number | null;
  }>>;

  backupCurrentSqliteDatabase?(options?: { sourceId?: string; now?: number }): Promise<{ backupPath: string; bytes: Uint8Array }>;

  replaceCurrentSqliteDatabase?(bytes: Uint8Array): Promise<void>;

  /**
   * 删除插件数据文件
   * @param fileName 文件名（相对于插件数据目录）
   */
  deleteFile(fileName: string): Promise<void>;
  
  /**
   * 读取 JSON 文件
   * @param fileName 文件名
   * @returns 解析后的对象，如果文件不存在返回 null
   */
  readJSON<T>(fileName: string): Promise<T | null>;
  
  /**
   * 写入 JSON 文件
   * @param fileName 文件名
   * @param data 要序列化的对象
   */
  writeJSON(fileName: string, data: unknown): Promise<void>;
  
  /**
   * 读取 MessagePack 文件
   * @param fileName 文件名
   * @returns 解析后的对象，如果文件不存在返回 null
   */
  readMsgpack<T>(fileName: string): Promise<T | null>;
  
  /**
   * 写入 MessagePack 文件
   * @param fileName 文件名
   * @param data 要序列化的对象
   */
  writeMsgpack(fileName: string, data: unknown): Promise<void>;
}

/**
 * 文件操作错误
 */
export class FileOperationError extends Error {
  constructor(
    public readonly operation: 'read' | 'write',
    public readonly fileName: string,
    public readonly cause: Error
  ) {
    super(`Failed to ${operation} file "${fileName}": ${cause.message}`);
    this.name = 'FileOperationError';
  }
}

interface FileErrorLike {
  code?: string;
  message?: string;
}

interface ReadDirEntry {
  name: string;
  isDir: boolean;
  updated?: number | null;
  size?: number | null;
}

interface FileApiEnvelope {
  code?: number;
  data?: unknown;
}

function describeLoadedData(data: unknown): Record<string, unknown> {
  if (data === null) {
    return { type: 'null' };
  }
  if (data === undefined) {
    return { type: 'undefined' };
  }
  if (Array.isArray(data)) {
    return { type: 'array', length: data.length };
  }
  if (typeof data === 'string') {
    return { type: 'string', length: data.length };
  }
  if (typeof data === 'object') {
    return { type: 'object', keys: Object.keys(data).slice(0, 8) };
  }
  return { type: typeof data };
}

function entryIsDir(entry: Record<string, unknown>): boolean {
  return entry.isDir === true
    || entry.isdir === true
    || entry.isDir === 1
    || entry.isdir === 1
    || entry.type === 'dir'
    || entry.type === 'directory';
}

function normalizeReadDirEntries(value: unknown): ReadDirEntry[] {
  const source = Array.isArray(value)
    ? value
    : typeof value === 'object' && value !== null
      ? (Array.isArray((value as { files?: unknown }).files)
        ? (value as { files: unknown[] }).files
        : Array.isArray((value as { entries?: unknown }).entries)
          ? (value as { entries: unknown[] }).entries
          : [])
      : [];
  return source
    .filter((entry): entry is Record<string, unknown> => typeof entry === 'object' && entry !== null)
    .map((entry) => ({
      name: String(entry.name || '').trim(),
      isDir: entryIsDir(entry),
      updated: Number.isFinite(Number(entry.updated ?? entry.mtime ?? entry.modTime))
        ? Number(entry.updated ?? entry.mtime ?? entry.modTime)
        : null,
      size: Number.isFinite(Number(entry.size)) ? Number(entry.size) : null,
    }))
    .filter((entry) => Boolean(entry.name));
}

/**
 * 文件服务实现
 */
export class FileService implements IFileService {
  constructor(private readonly plugin: SiyuanMemoPlugin) {}

  private resolvePluginDataPath(fileName: string): string {
    const normalized = String(fileName || '').replace(/^\/+/, '');
    return `${getPluginDataPath(this.plugin.name)}/${normalized}`;
  }

  /**
   * 读取插件数据文件
   */
  async readFile(fileName: string): Promise<string | null> {
    try {
      const content = await this.plugin.loadData(fileName);
      
      // loadData 返回 null 或 undefined 表示文件不存在
      if (content === null || content === undefined) {
        return null;
      }
      
      // 如果是字符串，直接返回
      if (typeof content === 'string') {
        return content;
      }
      
      // 如果是对象，转换为 JSON 字符串
      return JSON.stringify(content);
    } catch (error) {
      // 文件不存在是预期行为，返回 null
      if (this.isFileNotFoundError(error)) {
        return null;
      }
      
      // 其他错误抛出
      logger.error(`[FileService] Failed to read file "${fileName}":`, error);
      throw new FileOperationError(
        'read',
        fileName,
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  /**
   * 写入插件数据文件
   */
  async writeFile(fileName: string, content: string): Promise<void> {
    try {
      await this.plugin.saveData(fileName, content);
    } catch (error) {
      logger.error(`[FileService] Failed to write file "${fileName}":`, error);
      throw new FileOperationError(
        'write',
        fileName,
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  /**
   * 读取二进制插件数据文件
   */
  async readBinary(fileName: string): Promise<Uint8Array | null> {
    try {
      const response = await fetch('/api/file/getFile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: this.resolvePluginDataPath(fileName) }),
      });

      if (!response.ok) {
        return null;
      }

      const buffer = await response.arrayBuffer();
      if (buffer.byteLength === 0) {
        return null;
      }
      return new Uint8Array(buffer);
    } catch (error) {
      if (this.isFileNotFoundError(error)) {
        return null;
      }
      logger.error(`[FileService] Failed to read binary file "${fileName}":`, error);
      throw new FileOperationError(
        'read',
        fileName,
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  /**
   * 写入二进制插件数据文件
   */
  async writeBinary(fileName: string, bytes: Uint8Array): Promise<void> {
    try {
      const payload = bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength
        ? bytes.buffer
        : bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
      await putFile(
        this.resolvePluginDataPath(fileName),
        new Blob([payload as BlobPart], { type: 'application/x-sqlite3' }),
      );
    } catch (error) {
      logger.error(`[FileService] Failed to write binary file "${fileName}":`, error);
      throw new FileOperationError(
        'write',
        fileName,
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  async readSyncConflictDatabaseSources(): Promise<Array<{
    sourceId: string;
    bytes: Uint8Array;
    path?: string | null;
    modifiedAt?: number | null;
    size?: number | null;
  }>> {
    const conflictRoot = '/temp/repo/sync/conflicts';
    const pluginStoragePath = `${getPluginDataPath(this.plugin.name)}/siyuanmemo.db`
      .replace(/^\/data(?=\/)/, '');
    const conflictEntries = await this.readDir(conflictRoot);
    const sources: Array<{ sourceId: string; bytes: Uint8Array }> = [];

    for (const entry of conflictEntries) {
      if (!entry.isDir || !entry.name) {
        continue;
      }
      const dbPath = `${conflictRoot}/${entry.name}${pluginStoragePath}`;
      const bytes = await this.readAbsoluteBinary(dbPath);
      if (bytes && bytes.byteLength > 0) {
        sources.push({
          sourceId: `siyuan-sync-conflict:${entry.name}:${pluginStoragePath}`,
          bytes,
          path: dbPath,
          modifiedAt: entry.updated ?? null,
          size: entry.size ?? bytes.byteLength,
        });
      }
    }

    return sources;
  }

  async backupCurrentSqliteDatabase(options: { sourceId?: string; now?: number } = {}): Promise<{
    backupPath: string;
    bytes: Uint8Array;
  }> {
    const current = await this.readBinary('siyuanmemo.db');
    if (!current || current.byteLength === 0) {
      throw new FileOperationError('read', 'siyuanmemo.db', new Error('current sqlite database is missing'));
    }
    const safeSourceId = String(options.sourceId || 'manual-replacement')
      .replace(/[^a-zA-Z0-9._-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 96) || 'manual-replacement';
    const stamp = new Date(options.now ?? Date.now())
      .toISOString()
      .replace(/[:.]/g, '-');
    const backupPath = `manual-sync-backups/siyuanmemo.db.${stamp}.${safeSourceId}.bak`;
    await this.writeBinary(backupPath, current);
    return { backupPath, bytes: current };
  }

  async replaceCurrentSqliteDatabase(bytes: Uint8Array): Promise<void> {
    if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0) {
      throw new FileOperationError('write', 'siyuanmemo.db', new Error('replacement sqlite database bytes are empty'));
    }
    await this.writeBinary('siyuanmemo.db', bytes);
  }

  private async readAbsoluteBinary(path: string): Promise<Uint8Array | null> {
    try {
      const response = await fetch('/api/file/getFile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path }),
      });
      if (!response.ok) {
        return null;
      }
      const buffer = await response.arrayBuffer();
      if (buffer.byteLength === 0) {
        return null;
      }
      return new Uint8Array(buffer);
    } catch {
      return null;
    }
  }

  private async readDir(path: string): Promise<ReadDirEntry[]> {
    try {
      const response = await fetch('/api/file/readDir', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path }),
      });
      if (!response.ok) {
        return [];
      }
      const envelope = await response.json() as FileApiEnvelope;
      if (envelope.code !== 0) {
        return [];
      }
      return normalizeReadDirEntries(envelope.data);
    } catch {
      return [];
    }
  }

  /**
   * 删除插件数据文件
   */
  async deleteFile(fileName: string): Promise<void> {
    try {
      await this.plugin.removeData(fileName);
    } catch (error) {
      if (this.isFileNotFoundError(error)) {
        return;
      }
      logger.error(`[FileService] Failed to delete file "${fileName}":`, error);
      throw new FileOperationError(
        'write',
        fileName,
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  /**
   * 读取 JSON 文件
   */
  async readJSON<T>(fileName: string): Promise<T | null> {
    try {
      const data = await this.plugin.loadData(fileName);
      logger.trace(`[FileService] readJSON loaded "${fileName}"`, describeLoadedData(data));
      
      // loadData 返回 null 或 undefined 表示文件不存在
      if (data === null || data === undefined) {
        return null;
      }
      
      // 🔧 修复：如果是空字符串，也视为文件不存在
      if (typeof data === 'string' && data.trim() === '') {
        return null;
      }
      
      // 如果是字符串，需要解析
      if (typeof data === 'string') {
        return JSON.parse(data) as T;
      }
      
      // 如果已经是对象，直接返回
      return data as T;
    } catch (error) {
      logger.error(`[FileService] Error in readJSON("${fileName}"):`, error);
      
      // 文件不存在是预期行为，返回 null
      if (this.isFileNotFoundError(error)) {
        return null;
      }
      
      // JSON 解析错误
      if (error instanceof SyntaxError) {
        logger.error(`[FileService] Invalid JSON in file "${fileName}":`, error);
        // 🔧 修复：JSON 解析错误时返回 null，而不是抛出异常
        // 这样可以让 SettingsService 使用默认配置
        logger.warn(`[FileService] Treating invalid JSON as missing file, returning null`);
        return null;
      }
      
      // 其他错误抛出
      logger.error(`[FileService] Failed to read JSON file "${fileName}":`, error);
      throw new FileOperationError(
        'read',
        fileName,
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  /**
   * 写入 JSON 文件
   */
  async writeJSON(fileName: string, data: unknown): Promise<void> {
    try {
      // 验证数据可以序列化为 JSON
      const jsonString = JSON.stringify(data, null, 2);
      await this.plugin.saveData(fileName, jsonString);
    } catch (error) {
      // JSON 序列化错误
      if (error instanceof TypeError) {
        logger.error(`[FileService] Cannot serialize data to JSON for file "${fileName}":`, error);
        throw new FileOperationError(
          'write',
          fileName,
          new Error(`Data is not JSON-serializable: ${error.message}`)
        );
      }
      
      // 其他错误抛出
      logger.error(`[FileService] Failed to write JSON file "${fileName}":`, error);
      throw new FileOperationError(
        'write',
        fileName,
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  /**
   * 读取 MessagePack 文件
   */
  async readMsgpack<T>(fileName: string): Promise<T | null> {
    try {
      // SiYuan Plugin API 的 loadData 会自动处理 MessagePack 格式
      const data = await this.plugin.loadData(fileName);
      
      // loadData 返回 null 或 undefined 表示文件不存在
      if (data === null || data === undefined) {
        return null;
      }
      
      return data as T;
    } catch (error) {
      // 文件不存在是预期行为，返回 null
      if (this.isFileNotFoundError(error)) {
        return null;
      }
      
      // 其他错误抛出
      logger.error(`[FileService] Failed to read MessagePack file "${fileName}":`, error);
      throw new FileOperationError(
        'read',
        fileName,
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  /**
   * 写入 MessagePack 文件
   */
  async writeMsgpack(fileName: string, data: unknown): Promise<void> {
    try {
      // SiYuan Plugin API 的 saveData 会自动处理 MessagePack 格式
      await this.plugin.saveData(fileName, data);
    } catch (error) {
      logger.error(`[FileService] Failed to write MessagePack file "${fileName}":`, error);
      throw new FileOperationError(
        'write',
        fileName,
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  /**
   * 检查是否是文件不存在错误
   */
  private isFileNotFoundError(error: unknown): boolean {
    // 检查常见的文件不存在错误标识
    if (!error || typeof error !== 'object') {
      return false;
    }

    const candidate = error as FileErrorLike;
    const message = typeof candidate.message === 'string'
      ? candidate.message.toLowerCase()
      : '';

    return candidate.code === 'ENOENT'
      || message.includes('not found')
      || message.includes('does not exist');
  }
}
