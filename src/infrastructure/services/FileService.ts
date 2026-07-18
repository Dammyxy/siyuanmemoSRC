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
import { recordRuntimePerformanceSpan } from '@/utils/runtimePerformanceDiagnostics';
import {
  SIYUANMEMO_FORBIDDEN_PETAL_SQLITE_DB_PATH,
  SIYUANMEMO_TEMP_PROJECTION_DB_PATH,
  SIYUANMEMO_TEMP_PROJECTION_ROOT_PATH,
} from '../../../packages/contracts/src/backend-rpc';
import { ManualSyncBackupInventory } from './ManualSyncBackupInventory';

const logger = createLogger('FileService');
const SQLITE_DATABASE_HEADER = new TextEncoder().encode('SQLite format 3\0');
const SIYUANMEMO_INSTALLATION_IDENTITY_ROOT = '/conf/siyuan-plugin-siyuanmemo';
const SIYUANMEMO_INSTALLATION_IDENTITY_FILES = new Set([
  'truth-device-identity.v1.json',
  'truth-device-identity.previous.v1.json',
]);

function isSqliteDatabaseBytes(bytes: Uint8Array): boolean {
  if (bytes.byteLength < SQLITE_DATABASE_HEADER.byteLength) {
    return false;
  }
  return SQLITE_DATABASE_HEADER.every((byte, index) => bytes[index] === byte);
}

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
  writeBinary?(fileName: string, bytes: Uint8Array, options?: {
    diagnostics?: Record<string, unknown>;
  }): Promise<void>;

  /**
   * 读取工作空间 temp 中的 SQLite 投影数据库。
   */
  readTempProjectionBinary?(fileName: string): Promise<Uint8Array | null>;

  /**
   * 写入工作空间 temp 中的 SQLite 投影数据库。
   */
  writeTempProjectionBinary?(fileName: string, bytes: Uint8Array, options?: {
    diagnostics?: Record<string, unknown>;
  }): Promise<void>;

  /**
   * Probe for the forbidden legacy petal SQLite DB without reading its content.
   */
  hasLegacyPetalSqliteDb?(): Promise<boolean>;

  /**
   * Read local-only temp JSON. This is workspace-local state, not plugin petal storage.
   */
  readTempLocalJSON?<T>(fileName: string): Promise<T | null>;

  /**
   * Write local-only temp JSON. This is workspace-local state, not plugin petal storage.
   */
  writeTempLocalJSON?(fileName: string, data: unknown): Promise<void>;

  /** Read a strictly allowlisted local installation identity file under workspace conf/. */
  readInstallationIdentityText?(fileName: string): Promise<string | null>;

  /** Write a strictly allowlisted local installation identity file under workspace conf/. */
  writeInstallationIdentityText?(fileName: string, content: string): Promise<void>;

  /** Probe whether a plugin-data subtree contains any files or directories. */
  hasPluginDataEntries?(prefix: string): Promise<boolean>;

  /**
   * 列出插件数据目录下某个相对目录的直接文件
   */
  listFiles?(prefix: string): Promise<string[]>;

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

  cleanupSyncConflictDatabaseSources?(sourceIds: string[]): Promise<{
    cleaned: Array<{ sourceId: string; path: string | null }>;
    skipped: Array<{ sourceId: string; reason: string }>;
    failed: Array<{ sourceId: string; path: string | null; reason: string }>;
  }>;

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

function parseFileApiEnvelope(response: Response, bytes: Uint8Array): FileApiEnvelope | null {
  if (!response.headers.get('content-type')?.toLowerCase().includes('application/json')) {
    return null;
  }
  try {
    const value = JSON.parse(new TextDecoder().decode(bytes)) as unknown;
    return typeof value === 'object' && value !== null
      ? value as FileApiEnvelope
      : null;
  } catch {
    return null;
  }
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
  private readonly tempProjectionMemoryFallback = new Map<string, Uint8Array>();

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
      const bytes = new Uint8Array(buffer);
      const envelope = parseFileApiEnvelope(response, bytes);
      if (envelope?.code === 404) {
        return null;
      }
      if (envelope?.code !== undefined && envelope.code !== 0) {
        throw new Error(`SiYuan getFile failed with code ${envelope.code}`);
      }
      return bytes;
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
  async writeBinary(fileName: string, bytes: Uint8Array, options: {
    diagnostics?: Record<string, unknown>;
  } = {}): Promise<void> {
    const startedAt = Date.now();
    const byteLength = bytes.byteLength;
    const sqliteDatabase = isSqliteDatabaseBytes(bytes);
    try {
      const payload = bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength
        ? bytes.buffer
        : bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
      await putFile(
        this.resolvePluginDataPath(fileName),
        new Blob([payload as BlobPart], { type: 'application/x-sqlite3' }),
      );
      recordRuntimePerformanceSpan('file', 'write-binary', Date.now() - startedAt, {
        fileName,
        byteLength,
        sqliteDatabase,
        ...(options.diagnostics || {}),
        status: 'written',
      });
    } catch (error) {
      recordRuntimePerformanceSpan('file', 'write-binary', Date.now() - startedAt, {
        fileName,
        byteLength,
        sqliteDatabase,
        ...(options.diagnostics || {}),
        status: 'failed',
      }, {
        ok: false,
        errorName: error instanceof Error ? error.name : 'Error',
      });
      logger.error(`[FileService] Failed to write binary file "${fileName}":`, error);
      throw new FileOperationError(
        'write',
        fileName,
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  async readTempProjectionBinary(fileName: string): Promise<Uint8Array | null> {
    const path = this.resolveTempProjectionPath(fileName);
    const cached = this.tempProjectionMemoryFallback.get(path);
    if (cached) {
      return new Uint8Array(cached);
    }
    return this.readAbsoluteBinary(path);
  }

  async writeTempProjectionBinary(fileName: string, bytes: Uint8Array, options: {
    diagnostics?: Record<string, unknown>;
  } = {}): Promise<void> {
    const startedAt = Date.now();
    const byteLength = bytes.byteLength;
    const sqliteDatabase = isSqliteDatabaseBytes(bytes);
    const path = this.resolveTempProjectionPath(fileName);
    const payload = bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength
      ? bytes.buffer
      : bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    try {
      await putFile(
        path,
        new Blob([payload as BlobPart], { type: 'application/x-sqlite3' }),
      );
      this.tempProjectionMemoryFallback.delete(path);
      recordRuntimePerformanceSpan('file', 'write-binary', Date.now() - startedAt, {
        fileName,
        byteLength,
        sqliteDatabase,
        storageClass: 'temp-sql-projection-db',
        ...(options.diagnostics || {}),
        status: 'written',
      });
    } catch (error) {
      recordRuntimePerformanceSpan('file', 'write-binary', Date.now() - startedAt, {
        fileName,
        byteLength,
        sqliteDatabase,
        storageClass: 'temp-sql-projection-db',
        ...(options.diagnostics || {}),
        status: 'failed',
      }, {
        ok: false,
        errorName: error instanceof Error ? error.name : 'Error',
      });
      this.tempProjectionMemoryFallback.set(path, new Uint8Array(payload as ArrayBuffer));
      logger.warn(`[FileService] Temp projection persistence unavailable for "${fileName}"; using in-memory projection fallback`, error);
      recordRuntimePerformanceSpan('file', 'write-binary', Date.now() - startedAt, {
        fileName,
        byteLength,
        sqliteDatabase,
        storageClass: 'in-memory-sql-projection-db',
        ...(options.diagnostics || {}),
        status: 'memory-fallback',
      });
    }
  }

  async hasLegacyPetalSqliteDb(): Promise<boolean> {
    try {
      const entries = await this.readDir(getPluginDataPath(this.plugin.name));
      return entries.some((entry) => !entry.isDir && entry.name === 'siyuanmemo.db');
    } catch (error) {
      logger.warn(
        `[FileService] Failed to probe ignored legacy petal DB "${SIYUANMEMO_FORBIDDEN_PETAL_SQLITE_DB_PATH}":`,
        error,
      );
      return false;
    }
  }

  async readTempLocalJSON<T>(fileName: string): Promise<T | null> {
    try {
      const response = await fetch('/api/file/getFile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: this.resolveTempLocalPath(fileName, 'read') }),
      });
      if (!response.ok) {
        return null;
      }
      const text = await response.text();
      if (!text.trim()) {
        return null;
      }
      return JSON.parse(text) as T;
    } catch (error) {
      if (error instanceof SyntaxError) {
        logger.warn(`[FileService] Invalid temp-local JSON in "${fileName}", treating as missing`);
        return null;
      }
      logger.error(`[FileService] Failed to read temp-local JSON "${fileName}":`, error);
      throw new FileOperationError(
        'read',
        fileName,
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  }

  async writeTempLocalJSON(fileName: string, data: unknown): Promise<void> {
    try {
      await putFile(
        this.resolveTempLocalPath(fileName, 'write'),
        new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }),
      );
    } catch (error) {
      logger.error(`[FileService] Failed to write temp-local JSON "${fileName}":`, error);
      throw new FileOperationError(
        'write',
        fileName,
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  }

  async readInstallationIdentityText(fileName: string): Promise<string | null> {
    const path = this.resolveInstallationIdentityPath(fileName, 'read');
    try {
      const response = await fetch('/api/file/getFile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path }),
      });
      const text = await response.text();
      const envelope = this.parseTextFileApiEnvelope(response, text);
      if (envelope?.code === 404) {
        return null;
      }
      if (!response.ok || (envelope?.code !== undefined && envelope.code !== 0)) {
        throw new Error(`SiYuan getFile failed: HTTP ${response.status}, code ${envelope?.code ?? 'unknown'}`);
      }
      return text.trim() ? text : null;
    } catch (error) {
      if (this.isFileNotFoundError(error)) {
        return null;
      }
      throw new FileOperationError(
        'read',
        path,
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  }

  async writeInstallationIdentityText(fileName: string, content: string): Promise<void> {
    const path = this.resolveInstallationIdentityPath(fileName, 'write');
    try {
      await putFile(
        path,
        new Blob([content], { type: 'application/json' }),
      );
    } catch (error) {
      throw new FileOperationError(
        'write',
        path,
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  }

  async hasPluginDataEntries(prefix: string): Promise<boolean> {
    const normalized = String(prefix || '')
      .replace(/\\/g, '/')
      .replace(/^\/+/, '')
      .replace(/\/+$/g, '');
    if (!normalized || normalized.includes('..')) {
      throw new FileOperationError('read', prefix, new Error('invalid plugin data evidence prefix'));
    }
    const path = this.resolvePluginDataPath(normalized);
    try {
      const response = await fetch('/api/file/readDir', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path }),
      });
      const envelope = await response.json() as FileApiEnvelope;
      if (envelope.code === 404) {
        return false;
      }
      if (!response.ok || envelope.code !== 0) {
        throw new Error(`SiYuan readDir failed: HTTP ${response.status}, code ${envelope.code ?? 'unknown'}`);
      }
      return normalizeReadDirEntries(envelope.data).length > 0;
    } catch (error) {
      throw new FileOperationError(
        'read',
        path,
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  }

  async listFiles(prefix: string): Promise<string[]> {
    const normalized = String(prefix || '')
      .replace(/\\/g, '/')
      .replace(/^\/+/, '')
      .replace(/\/+$/g, '');
    if (!normalized || normalized.includes('..')) {
      throw new FileOperationError('read', prefix, new Error('invalid plugin data directory prefix'));
    }
    const pending = [normalized];
    const files: string[] = [];
    while (pending.length > 0) {
      const directory = pending.shift()!;
      const entries = await this.readDir(this.resolvePluginDataPath(directory));
      for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
        const name = String(entry.name || '').trim();
        if (!name || name === '.' || name === '..' || /[\\/]/.test(name)) {
          continue;
        }
        const path = `${directory}/${name}`;
        if (entry.isDir) {
          pending.push(path);
        } else {
          files.push(path);
        }
      }
    }
    return files.sort();
  }

  async listFileEntries(prefix: string): Promise<Array<{ path: string; size: number | null }>> {
    const normalized = String(prefix || '')
      .replace(/\\/g, '/')
      .replace(/^\/+/, '')
      .replace(/\/+$/g, '');
    if (!normalized || normalized.includes('..')) {
      throw new FileOperationError('read', prefix, new Error('invalid plugin data directory prefix'));
    }
    const entries = await this.readDir(this.resolvePluginDataPath(normalized));
    return entries
      .filter((entry) => !entry.isDir)
      .map((entry) => ({
        path: `${normalized}/${entry.name}`,
        size: Number.isFinite(Number(entry.size)) ? Math.max(0, Math.floor(Number(entry.size))) : null,
      }));
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
    let conflictEntries: ReadDirEntry[];
    try {
      conflictEntries = await this.readDir(conflictRoot);
    } catch (error) {
      if (this.isFileNotFoundError(error)) {
        return [];
      }
      logger.warn('[FileService] Failed to read SiYuan sync conflict root; treating as no conflict sources', {
        conflictRoot,
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
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

  async cleanupSyncConflictDatabaseSources(sourceIds: string[]): Promise<{
    cleaned: Array<{ sourceId: string; path: string | null }>;
    skipped: Array<{ sourceId: string; reason: string }>;
    failed: Array<{ sourceId: string; path: string | null; reason: string }>;
  }> {
    const normalized = new Set(sourceIds.map((sourceId) => String(sourceId || '').trim()).filter(Boolean));
    if (normalized.size === 0) {
      return { cleaned: [], skipped: [], failed: [] };
    }
    const sources = await this.readSyncConflictDatabaseSources();
    const byId = new Map(sources.map((source) => [source.sourceId, source]));
    const cleaned: Array<{ sourceId: string; path: string | null }> = [];
    const skipped: Array<{ sourceId: string; reason: string }> = [];
    const failed: Array<{ sourceId: string; path: string | null; reason: string }> = [];

    for (const sourceId of normalized) {
      const source = byId.get(sourceId);
      if (!source) {
        skipped.push({ sourceId, reason: 'source-not-found' });
        continue;
      }
      const path = String(source.path || '').trim();
      if (!path) {
        skipped.push({ sourceId, reason: 'missing-path' });
        continue;
      }
      try {
        await this.removeAbsoluteFile(path);
        cleaned.push({ sourceId, path });
      } catch (error) {
        failed.push({
          sourceId,
          path,
          reason: error instanceof Error ? error.message : String(error),
        });
      }
    }
    return { cleaned, skipped, failed };
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

  createManualSyncBackupInventory(): ManualSyncBackupInventory {
    return new ManualSyncBackupInventory({
      resolvePluginDataPath: (path) => this.resolvePluginDataPath(path),
      readDir: (path) => this.readDir(path),
      readBinary: (path) => this.readBinary(path),
      deleteFile: (path) => this.deleteFile(path),
    });
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
      const bytes = new Uint8Array(buffer);
      if (!isSqliteDatabaseBytes(bytes)) {
        return null;
      }
      return bytes;
    } catch {
      return null;
    }
  }

  private resolveTempProjectionPath(fileName: string): string {
    const normalized = String(fileName || '')
      .replace(/\\/g, '/')
      .replace(/^\/+/, '');
    if (normalized !== 'siyuanmemo.db') {
      throw new FileOperationError('read', fileName, new Error('invalid temp projection binary path'));
    }
    return `/${SIYUANMEMO_TEMP_PROJECTION_DB_PATH}`;
  }

  private resolveTempLocalPath(fileName: string, operation: 'read' | 'write'): string {
    const normalized = String(fileName || '')
      .replace(/\\/g, '/')
      .replace(/^\/+/, '');
    if (!normalized || normalized.includes('..')) {
      throw new FileOperationError(operation, fileName, new Error('invalid temp-local path'));
    }
    return `/${SIYUANMEMO_TEMP_PROJECTION_ROOT_PATH}/local/${normalized}`;
  }

  private resolveInstallationIdentityPath(fileName: string, operation: 'read' | 'write'): string {
    const normalized = String(fileName || '')
      .replace(/\\/g, '/')
      .replace(/^\/+/, '');
    if (!SIYUANMEMO_INSTALLATION_IDENTITY_FILES.has(normalized)) {
      throw new FileOperationError(operation, fileName, new Error('invalid installation identity path'));
    }
    return `${SIYUANMEMO_INSTALLATION_IDENTITY_ROOT}/${normalized}`;
  }

  private parseTextFileApiEnvelope(response: Response, text: string): FileApiEnvelope | null {
    if (!response.headers.get('content-type')?.toLowerCase().includes('application/json')) {
      return null;
    }
    try {
      const parsed = JSON.parse(text) as unknown;
      if (
        typeof parsed === 'object'
        && parsed !== null
        && typeof (parsed as { code?: unknown }).code === 'number'
        && 'data' in parsed
      ) {
        return parsed as FileApiEnvelope;
      }
    } catch {
      return null;
    }
    return null;
  }

  private async removeAbsoluteFile(path: string): Promise<void> {
    const response = await fetch('/api/file/removeFile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path }),
    });
    if (!response.ok) {
      throw new Error(`removeFile failed: HTTP ${response.status}`);
    }
    const envelope = await response.json().catch(() => ({ code: 0 })) as FileApiEnvelope;
    if (envelope.code !== undefined && envelope.code !== 0) {
      throw new Error(`removeFile failed: code ${envelope.code}`);
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
