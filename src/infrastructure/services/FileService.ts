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
  writeJSON(fileName: string, data: any): Promise<void>;
  
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
  writeMsgpack(fileName: string, data: any): Promise<void>;
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

/**
 * 文件服务实现
 */
export class FileService implements IFileService {
  constructor(private readonly plugin: SiyuanMemoPlugin) {}

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
      console.error(`[FileService] Failed to read file "${fileName}":`, error);
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
      console.error(`[FileService] Failed to write file "${fileName}":`, error);
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
      
      // loadData 返回 null 或 undefined 表示文件不存在
      if (data === null || data === undefined) {
        return null;
      }
      
      // 如果是字符串，需要解析
      if (typeof data === 'string') {
        return JSON.parse(data) as T;
      }
      
      // 如果已经是对象，直接返回
      return data as T;
    } catch (error) {
      // 文件不存在是预期行为，返回 null
      if (this.isFileNotFoundError(error)) {
        return null;
      }
      
      // JSON 解析错误
      if (error instanceof SyntaxError) {
        console.error(`[FileService] Invalid JSON in file "${fileName}":`, error);
        throw new FileOperationError(
          'read',
          fileName,
          new Error(`Invalid JSON format: ${error.message}`)
        );
      }
      
      // 其他错误抛出
      console.error(`[FileService] Failed to read JSON file "${fileName}":`, error);
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
  async writeJSON(fileName: string, data: any): Promise<void> {
    try {
      // 验证数据可以序列化为 JSON
      const jsonString = JSON.stringify(data, null, 2);
      await this.plugin.saveData(fileName, jsonString);
    } catch (error) {
      // JSON 序列化错误
      if (error instanceof TypeError) {
        console.error(`[FileService] Cannot serialize data to JSON for file "${fileName}":`, error);
        throw new FileOperationError(
          'write',
          fileName,
          new Error(`Data is not JSON-serializable: ${error.message}`)
        );
      }
      
      // 其他错误抛出
      console.error(`[FileService] Failed to write JSON file "${fileName}":`, error);
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
      console.error(`[FileService] Failed to read MessagePack file "${fileName}":`, error);
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
  async writeMsgpack(fileName: string, data: any): Promise<void> {
    try {
      // SiYuan Plugin API 的 saveData 会自动处理 MessagePack 格式
      await this.plugin.saveData(fileName, data);
    } catch (error) {
      console.error(`[FileService] Failed to write MessagePack file "${fileName}":`, error);
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
  private isFileNotFoundError(error: any): boolean {
    // 检查常见的文件不存在错误标识
    return (
      error?.code === 'ENOENT' ||
      error?.message?.includes('not found') ||
      error?.message?.includes('does not exist')
    );
  }
}
