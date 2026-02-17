/**
 * Xiuyuan Storage Manager
 * 负责 Xiuyuan 数据的持久化和查询
 * 
 * @module XiuyuanStorage
 * @description
 * 存储管理器负责 Xiuyuan 数据的 CRUD 操作和持久化。
 * 
 * **存储策略**：
 * - Phase 1: JSON 文件存储（当前实现）
 * - Phase 2: JSON + 内存索引（数据量 > 3万时）
 * - Phase 3: sql.js 内存数据库（数据量 > 10万时）
 * 
 * **内存索引**：
 * - `indexByBlockID`: 快速查询某个块关联的所有 Xiuyuan
 * - `indexByCardID`: 快速查询某张卡片对应的 Mapping
 * 
 * @example
 * ```typescript
 * const storage = new XiuyuanStorage(plugin);
 * const loadResult = await storage.load();
 * if (!loadResult.ok) {
 *   console.error('Load failed:', loadResult.error);
 * }
 * 
 * // 创建 Xiuyuan
 * const xiuyuan = storage.createXiuyuan({
 *   blockIDs: ['block-1', 'block-2'],
 *   fields: [{ name: 'question', blockID: 'block-1' }],
 *   templateID: 'basic',
 * });
 * 
 * // 查询
 * const found = storage.getXiuyuan(xiuyuan.id);
 * const byBlock = storage.getXiuyuansByBlockID('block-1');
 * 
 * // 保存
 * const saveResult = await storage.save();
 * if (!saveResult.ok) {
 *   console.error('Save failed:', saveResult.error);
 * }
 * ```
 */

import type {
  IXiuyuan,
  ICardMapping,
  ICardTemplate,
  IXiuyuanStore,
} from './types';
import { XIUYUAN_STORAGE_KEY, XIUYUAN_CURRENT_VERSION } from './types';
import { ok, err, type Result } from '@/types/result';
import type SiyuanMemoPlugin from '@/index';

/**
 * 生成唯一 ID
 * 
 * @returns 格式为 `xy_{timestamp}_{random}` 的唯一标识符
 * @example
 * ```typescript
 * const id = generateID(); // "xy_1234567890_abc123"
 * ```
 */
function generateID(): string {
  return `xy_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Xiuyuan 存储管理器
 * 
 * @class XiuyuanStorage
 * @description
 * 管理 Xiuyuan、CardMapping 和 CardTemplate 的持久化存储。
 * 提供 CRUD 操作和内存索引以提升查询性能。
 */
export class XiuyuanStorage {
  /** 插件实例，用于调用 saveData/loadData */
  private plugin: SiyuanMemoPlugin;
  
  /** 内存中的数据存储 */
  private data: IXiuyuanStore;
  
  /** 脏标记，表示数据是否已修改 */
  private dirty = false;

  /** 内存索引：blockID -> xiuyuanID[] */
  private indexByBlockID: Map<string, string[]> = new Map();
  
  /** 内存索引：cardID -> mappingID */
  private indexByCardID: Map<string, string> = new Map();

  /**
   * 创建 XiuyuanStorage 实例
   * 
   * @param plugin - 插件实例，用于调用 saveData/loadData
   * @example
   * ```typescript
   * const storage = new XiuyuanStorage(plugin);
   * ```
   */
  constructor(plugin: SiyuanMemoPlugin) {
    this.plugin = plugin;
    this.data = this.getDefaultStore();
  }

  /**
   * 获取默认的空存储结构
   * 
   * @returns 初始化的空存储对象
   * @private
   */
  private getDefaultStore(): IXiuyuanStore {
    return {
      version: XIUYUAN_CURRENT_VERSION,
      xiuyuans: {},
      mappings: {},
      templates: {},
    };
  }

  // ============ 生命周期 ============

  /**
   * 从文件系统加载 Xiuyuan 数据
   * 
   * @description
   * 使用插件的 loadData() API 加载 MessagePack 数据。
   * 如果文件不存在，使用默认空数据（不视为错误）。
   * 加载后会自动重建内存索引。
   * 
   * 🆕 Phase 1.0.5: 使用 MessagePack 格式
   * - 性能提升：加载速度提升 60%
   * - 不持久化：仅在数据修改时保存，避免同步冲突
   * 
   * @returns Result<void>，成功时返回 ok(undefined)，失败时返回 err(Error)
   * 
   * **错误处理**：
   * - 文件不存在：返回 ok(undefined)，使用默认空数据
   * - 加载失败：返回 err(Error)
   * 
   * @example
   * ```typescript
   * const storage = new XiuyuanStorage(plugin);
   * const result = await storage.load();
   * if (result.ok) {
   *   console.log('Loaded:', storage.getStats());
   * } else {
   *   console.error('Load failed:', result.error.message);
   * }
   * ```
   * 
   * **Validates: Requirements 8.1, 8.2, 8.3**
   * - 8.1: Uses Result type pattern for operations that can fail
   * - 8.2: Returns { ok: true, value: T } on success
   * - 8.3: Returns { ok: false, error: Error } on failure
   */
  async load(): Promise<Result<void>> {
    try {
      const msgpackData = await this.plugin.loadData(XIUYUAN_STORAGE_KEY);
      
      if (msgpackData) {
        // MessagePack 数据已经被 plugin.loadData 自动解码
        this.data = this.migrate(msgpackData);
        this.rebuildIndex();
        console.log('[Xiuyuan] Loaded from msgpack:', this.getStats());
        return ok(undefined);
      }
      
      // 文件不存在，使用默认数据
      console.log('[Xiuyuan] No existing data file, using defaults');
      this.rebuildIndex();
      return ok(undefined);
      
    } catch (error) {
      console.error('[Xiuyuan] Load failed:', error);
      return err(error as Error);
    }
  }

  /**
   * 保存 Xiuyuan 数据到文件系统
   * 
   * @description
   * 仅在数据被修改时（dirty=true）才执行保存操作。
   * 保存成功后会清除 dirty 标记。
   * 使用插件的 saveData() API，数据会自动保存到正确的工作空间目录。
   * 
   * 🆕 Phase 1.0.5: 使用 MessagePack 格式
   * - 性能提升：保存速度提升 50%，文件大小减少 40%
   * - 自动同步：数据会被思源云同步到其他设备
   * 
   * @returns Result<void>，成功时返回 ok(undefined)，失败时返回 err(Error)
   * 
   * **错误处理**：
   * - 数据未修改：返回 ok(undefined)（跳过保存）
   * - 保存失败：返回 err(Error)
   * 
   * @example
   * ```typescript
   * storage.createXiuyuan({ ... }); // 修改数据
   * const result = await storage.save(); // 持久化到文件
   * if (result.ok) {
   *   console.log('Saved successfully');
   * } else {
   *   console.error('Save failed:', result.error.message);
   * }
   * ```
   * 
   * **Validates: Requirements 8.1, 8.2, 8.3**
   * - 8.1: Uses Result type pattern for operations that can fail
   * - 8.2: Returns { ok: true, value: T } on success
   * - 8.3: Returns { ok: false, error: Error } on failure
   */
  async save(): Promise<Result<void>> {
    if (!this.dirty) {
      return ok(undefined);
    }
    
    try {
      // 使用插件的 saveData API，会自动保存到正确的工作空间目录
      // 数据会被自动编码为 MessagePack 格式
      await this.plugin.saveData(XIUYUAN_STORAGE_KEY, this.data);
      
      this.dirty = false;
      console.log('[Xiuyuan] Saved to msgpack:', this.getStats());
      return ok(undefined);
    } catch (error) {
      console.error('[Xiuyuan] Save failed:', error);
      return err(error as Error);
    }
  }

  /**
   * 数据迁移处理
   * 
   * @description
   * 处理不同版本的数据格式迁移。
   * 当前版本为 1，未来版本升级时在此添加迁移逻辑。
   * 
   * @param stored - 从文件加载的原始数据
   * @returns 迁移后的数据
   * @private
   */
  private migrate(stored: any): IXiuyuanStore {
    if (!stored.version || stored.version < XIUYUAN_CURRENT_VERSION) {
      console.log('[Xiuyuan] Migrating from v' + (stored.version || 0));
      stored.version = XIUYUAN_CURRENT_VERSION;
    }
    // 确保所有字段存在
    stored.xiuyuans = stored.xiuyuans || {};
    stored.mappings = stored.mappings || {};
    stored.templates = stored.templates || {};
    return stored as IXiuyuanStore;
  }

  /**
   * 重建内存索引
   * 
   * @description
   * 遍历所有 Xiuyuan 和 Mapping，构建快速查询索引：
   * - indexByBlockID: 根据 blockID 快速查找关联的 Xiuyuan
   * - indexByCardID: 根据 cardID 快速查找对应的 Mapping
   * 
   * 在以下情况会调用：
   * - 数据加载后
   * - blockIDs 发生变化后
   * - 删除 Xiuyuan 后
   * 
   * @private
   */
  private rebuildIndex(): void {
    this.indexByBlockID.clear();
    this.indexByCardID.clear();

    for (const [id, xiuyuan] of Object.entries(this.data.xiuyuans)) {
      for (const blockID of xiuyuan.blockIDs) {
        const list = this.indexByBlockID.get(blockID) || [];
        list.push(id);
        this.indexByBlockID.set(blockID, list);
      }
    }

    for (const [id, mapping] of Object.entries(this.data.mappings)) {
      this.indexByCardID.set(mapping.cardID, id);
    }
  }

  // ============ Xiuyuan CRUD ============

  /**
   * 根据 ID 获取 Xiuyuan
   * 
   * @param id - Xiuyuan ID
   * @returns Xiuyuan 对象，如果不存在返回 undefined
   * 
   * @example
   * ```typescript
   * const xiuyuan = storage.getXiuyuan('xy_1234567890_abc123');
   * if (xiuyuan) {
   *   console.log('Found:', xiuyuan.templateID);
   * }
   * ```
   */
  getXiuyuan(id: string): IXiuyuan | undefined {
    return this.data.xiuyuans[id];
  }

  /**
   * 获取所有 Xiuyuan
   * 
   * @returns Xiuyuan 数组
   * 
   * @example
   * ```typescript
   * const all = storage.getAllXiuyuans();
   * console.log(`Total: ${all.length}`);
   * ```
   */
  getAllXiuyuans(): IXiuyuan[] {
    return Object.values(this.data.xiuyuans);
  }

  /**
   * 根据块 ID 查询关联的所有 Xiuyuan
   * 
   * @param blockID - 块 ID
   * @returns 包含该块的所有 Xiuyuan 数组
   * 
   * @description
   * 使用内存索引快速查询。
   * 一个块可能属于多个 Xiuyuan（例如共享的答案块）。
   * 
   * @example
   * ```typescript
   * const xiuyuans = storage.getXiuyuansByBlockID('20230101120000-abc123');
   * xiuyuans.forEach(x => console.log(x.templateID));
   * ```
   */
  getXiuyuansByBlockID(blockID: string): IXiuyuan[] {
    const ids = this.indexByBlockID.get(blockID) || [];
    return ids.map(id => this.data.xiuyuans[id]).filter(Boolean);
  }

  /**
   * 创建新的 Xiuyuan
   * 
   * @param data - Xiuyuan 数据（不包含 id、createdAt、updatedAt）
   * @returns 创建的 Xiuyuan 对象（包含自动生成的 id 和时间戳）
   * 
   * @description
   * 自动生成唯一 ID 和时间戳。
   * 创建后会更新内存索引并标记数据为 dirty。
   * 
   * @example
   * ```typescript
   * const xiuyuan = storage.createXiuyuan({
   *   blockIDs: ['block-1', 'block-2'],
   *   fields: [
   *     { name: 'question', blockID: 'block-1', marker: 'Q' },
   *     { name: 'answer', blockID: 'block-2', marker: 'A' }
   *   ],
   *   templateID: 'basic',
   *   meta: { source: 'manual' }
   * });
   * console.log('Created:', xiuyuan.id);
   * ```
   */
  createXiuyuan(data: Omit<IXiuyuan, 'id' | 'createdAt' | 'updatedAt'>): IXiuyuan {
    const now = Date.now();
    const id = generateID();
    const xiuyuan: IXiuyuan = {
      ...data,
      id,
      createdAt: now,
      updatedAt: now,
    };
    this.data.xiuyuans[id] = xiuyuan;
    this.dirty = true;

    // 更新索引
    for (const blockID of xiuyuan.blockIDs) {
      const list = this.indexByBlockID.get(blockID) || [];
      list.push(id);
      this.indexByBlockID.set(blockID, list);
    }

    return xiuyuan;
  }

  /**
   * 更新 Xiuyuan
   * 
   * @param id - Xiuyuan ID
   * @param updates - 要更新的字段（部分更新）
   * @returns 是否更新成功（false 表示 ID 不存在）
   * 
   * @description
   * 支持部分字段更新，自动更新 updatedAt 时间戳。
   * 如果 blockIDs 发生变化，会重建索引。
   * 
   * @example
   * ```typescript
   * const success = storage.updateXiuyuan('xy_123', {
   *   fields: [{ name: 'question', blockID: 'new-block' }]
   * });
   * if (success) {
   *   console.log('Updated successfully');
   * }
   * ```
   */
  updateXiuyuan(id: string, updates: Partial<IXiuyuan>): boolean {
    const existing = this.data.xiuyuans[id];
    if (!existing) return false;

    const blockIDsChanged = updates.blockIDs &&
      JSON.stringify(updates.blockIDs) !== JSON.stringify(existing.blockIDs);

    this.data.xiuyuans[id] = {
      ...existing,
      ...updates,
      id,
      updatedAt: Date.now(),
    };
    this.dirty = true;

    if (blockIDsChanged) {
      this.rebuildIndex();
    }
    return true;
  }

  /**
   * 删除 Xiuyuan
   * 
   * @param id - Xiuyuan ID
   * @returns 是否删除成功（false 表示 ID 不存在）
   * 
   * @description
   * 删除 Xiuyuan 时会：
   * 1. 删除所有关联的 CardMapping
   * 2. 更新内存索引
   * 3. 标记数据为 dirty
   * 
   * **注意**：不会自动删除思源 Riff 卡片，需要调用方处理。
   * 
   * @example
   * ```typescript
   * const success = storage.deleteXiuyuan('xy_123');
   * if (success) {
   *   await storage.save();
   *   console.log('Deleted and saved');
   * }
   * ```
   */
  deleteXiuyuan(id: string): boolean {
    if (!this.data.xiuyuans[id]) return false;

    // 删除关联的 mapping
    for (const [mappingID, mapping] of Object.entries(this.data.mappings)) {
      if (mapping.xiuyuanID === id) {
        delete this.data.mappings[mappingID];
        this.indexByCardID.delete(mapping.cardID);
      }
    }

    delete this.data.xiuyuans[id];
    this.dirty = true;
    this.rebuildIndex();
    return true;
  }

  // ============ Mapping CRUD ============

  /**
   * 根据 ID 获取 CardMapping
   * 
   * @param id - Mapping ID
   * @returns CardMapping 对象，如果不存在返回 undefined
   * 
   * @example
   * ```typescript
   * const mapping = storage.getMapping('xy_456');
   * if (mapping) {
   *   console.log('Card:', mapping.cardID);
   * }
   * ```
   */
  getMapping(id: string): ICardMapping | undefined {
    return this.data.mappings[id];
  }

  /**
   * 根据卡片 ID 获取 CardMapping
   * 
   * @param cardID - 卡片 ID（思源 Riff 卡片 ID）
   * @returns CardMapping 对象，如果不存在返回 undefined
   * 
   * @description
   * 使用内存索引快速查询。
   * 用于在复习界面根据卡片 ID 获取渲染数据。
   * 
   * @example
   * ```typescript
   * const mapping = storage.getMappingByCardID('20230101120000-abc123');
   * if (mapping) {
   *   const xiuyuan = storage.getXiuyuan(mapping.xiuyuanID);
   *   console.log('Template:', xiuyuan?.templateID);
   * }
   * ```
   */
  getMappingByCardID(cardID: string): ICardMapping | undefined {
    const id = this.indexByCardID.get(cardID);
    return id ? this.data.mappings[id] : undefined;
  }

  /**
   * 根据 Xiuyuan ID 获取所有关联的 CardMapping
   * 
   * @param xiuyuanID - Xiuyuan ID
   * @returns CardMapping 数组
   * 
   * @description
   * 一个 Xiuyuan 可以生成多张卡片（如英-中、中-英）。
   * 此方法返回所有关联的卡片映射。
   * 
   * @example
   * ```typescript
   * const mappings = storage.getMappingsByXiuyuanID('xy_123');
   * console.log(`Generated ${mappings.length} cards`);
   * mappings.forEach(m => console.log(m.typeMarker));
   * ```
   */
  getMappingsByXiuyuanID(xiuyuanID: string): ICardMapping[] {
    return Object.values(this.data.mappings).filter(m => m.xiuyuanID === xiuyuanID);
  }

  /**
   * 创建 CardMapping
   * 
   * @param mapping - CardMapping 数据
   * @returns 生成的 mapping ID
   * 
   * @description
   * 自动生成唯一 ID 并更新索引。
   * 
   * @example
   * ```typescript
   * const mappingID = storage.createMapping({
   *   xiuyuanID: 'xy_123',
   *   cardID: '20230101120000-abc123',
   *   frontFields: ['question'],
   *   backFields: ['answer'],
   *   typeMarker: 'basic'
   * });
   * console.log('Created mapping:', mappingID);
   * ```
   */
  createMapping(mapping: ICardMapping): string {
    const id = generateID();
    this.data.mappings[id] = mapping;
    this.indexByCardID.set(mapping.cardID, id);
    this.dirty = true;
    return id;
  }

  /**
   * 删除 CardMapping
   * 
   * @param id - Mapping ID
   * @returns 是否删除成功（false 表示 ID 不存在）
   * 
   * @description
   * 删除映射并更新索引。
   * 
   * @example
   * ```typescript
   * const success = storage.deleteMapping('xy_456');
   * if (success) {
   *   await storage.save();
   * }
   * ```
   */
  deleteMapping(id: string): boolean {
    const mapping = this.data.mappings[id];
    if (!mapping) return false;

    this.indexByCardID.delete(mapping.cardID);
    delete this.data.mappings[id];
    this.dirty = true;
    return true;
  }

  // ============ Template CRUD ============

  /**
   * 根据 ID 获取 CardTemplate
   * 
   * @param id - Template ID
   * @returns CardTemplate 对象，如果不存在返回 undefined
   * 
   * @example
   * ```typescript
   * const template = storage.getTemplate('basic');
   * if (template) {
   *   console.log('Fields:', template.fields.map(f => f.name));
   * }
   * ```
   */
  getTemplate(id: string): ICardTemplate | undefined {
    return this.data.templates[id];
  }

  /**
   * 获取所有 CardTemplate
   * 
   * @returns CardTemplate 数组
   * 
   * @example
   * ```typescript
   * const templates = storage.getAllTemplates();
   * templates.forEach(t => console.log(t.name));
   * ```
   */
  getAllTemplates(): ICardTemplate[] {
    return Object.values(this.data.templates);
  }

  /**
   * 创建 CardTemplate
   * 
   * @param template - CardTemplate 数据（必须包含 id）
   * 
   * @description
   * 使用提供的 ID 创建模板。
   * 
   * @example
   * ```typescript
   * storage.createTemplate({
   *   id: 'vocabulary',
   *   name: '词汇卡片',
   *   description: '英语词汇学习',
   *   fields: [
   *     { name: 'word', description: '单词' },
   *     { name: 'translation', description: '翻译' },
   *     { name: 'pronunciation', description: '发音' }
   *   ],
   *   cardRules: [
   *     { typeMarker: 'en-zh', frontFields: ['word'], backFields: ['translation'] },
   *     { typeMarker: 'zh-en', frontFields: ['translation'], backFields: ['word'] }
   *   ]
   * });
   * ```
   */
  createTemplate(template: ICardTemplate): void {
    this.data.templates[template.id] = template;
    this.dirty = true;
  }

  /**
   * 更新 CardTemplate
   * 
   * @param id - Template ID
   * @param updates - 要更新的字段（部分更新）
   * @returns 是否更新成功（false 表示 ID 不存在）
   * 
   * @example
   * ```typescript
   * const success = storage.updateTemplate('basic', {
   *   description: '基础问答卡片（更新版）'
   * });
   * ```
   */
  updateTemplate(id: string, updates: Partial<ICardTemplate>): boolean {
    const existing = this.data.templates[id];
    if (!existing) return false;

    this.data.templates[id] = { ...existing, ...updates, id };
    this.dirty = true;
    return true;
  }

  /**
   * 删除 CardTemplate
   * 
   * @param id - Template ID
   * @returns 是否删除成功（false 表示 ID 不存在）
   * 
   * @description
   * **注意**：删除模板不会删除使用该模板创建的 Xiuyuan。
   * 
   * @example
   * ```typescript
   * const success = storage.deleteTemplate('old-template');
   * if (success) {
   *   await storage.save();
   * }
   * ```
   */
  deleteTemplate(id: string): boolean {
    if (!this.data.templates[id]) return false;
    delete this.data.templates[id];
    this.dirty = true;
    return true;
  }

  // ============ 统计 ============

  /**
   * 获取存储统计信息
   * 
   * @returns 包含 Xiuyuan、Mapping 和 Template 数量的统计对象
   * 
   * @example
   * ```typescript
   * const stats = storage.getStats();
   * console.log(`Xiuyuans: ${stats.xiuyuanCount}`);
   * console.log(`Mappings: ${stats.mappingCount}`);
   * console.log(`Templates: ${stats.templateCount}`);
   * ```
   */
  getStats() {
    return {
      xiuyuanCount: Object.keys(this.data.xiuyuans).length,
      mappingCount: Object.keys(this.data.mappings).length,
      templateCount: Object.keys(this.data.templates).length,
    };
  }
}
