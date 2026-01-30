/**
 * Xiuyuan Storage Manager
 * 负责 Xiuyuan 数据的持久化和查询
 */

import type {
  IXiuyuan,
  ICardMapping,
  ICardTemplate,
  IXiuyuanStore,
} from './types';
import { XIUYUAN_STORAGE_KEY, XIUYUAN_CURRENT_VERSION } from './types';

/** 生成唯一 ID */
function generateID(): string {
  return `xy_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Xiuyuan 存储管理器
 */
export class XiuyuanStorage {
  private pluginName: string;
  private data: IXiuyuanStore;
  private dirty = false;

  // 内存索引
  private indexByBlockID: Map<string, string[]> = new Map();
  private indexByCardID: Map<string, string> = new Map();

  constructor(pluginName: string) {
    this.pluginName = pluginName;
    this.data = this.getDefaultStore();
  }

  private getDefaultStore(): IXiuyuanStore {
    return {
      version: XIUYUAN_CURRENT_VERSION,
      xiuyuans: {},
      mappings: {},
      templates: {},
    };
  }

  // ============ 生命周期 ============

  async load(): Promise<void> {
    try {
      // 正确的路径格式（不带 /data/ 前缀）
      const path = `storage/petal/${this.pluginName}/${XIUYUAN_STORAGE_KEY}`;
      const response = await fetch('/api/file/getFile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path }),
      });

      if (response.ok) {
        const text = await response.text();
        if (text) {
          const stored = JSON.parse(text);
          this.data = this.migrate(stored);
        }
      }
    } catch (err) {
      console.warn('[Xiuyuan] Load failed, using defaults:', err);
    }
    this.rebuildIndex();
  }

  async save(): Promise<void> {
    if (!this.dirty) return;
    try {
      const path = `storage/petal/${this.pluginName}/${XIUYUAN_STORAGE_KEY}`;
      const formData = new FormData();
      formData.append('path', path);
      formData.append('file', new Blob([JSON.stringify(this.data, null, 2)], { type: 'application/json' }));

      await fetch('/api/file/putFile', {
        method: 'POST',
        body: formData,
      });
      this.dirty = false;
    } catch (err) {
      console.error('[Xiuyuan] Save failed:', err);
    }
  }

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

  getXiuyuan(id: string): IXiuyuan | undefined {
    return this.data.xiuyuans[id];
  }

  getAllXiuyuans(): IXiuyuan[] {
    return Object.values(this.data.xiuyuans);
  }

  getXiuyuansByBlockID(blockID: string): IXiuyuan[] {
    const ids = this.indexByBlockID.get(blockID) || [];
    return ids.map(id => this.data.xiuyuans[id]).filter(Boolean);
  }

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

  getMapping(id: string): ICardMapping | undefined {
    return this.data.mappings[id];
  }

  getMappingByCardID(cardID: string): ICardMapping | undefined {
    const id = this.indexByCardID.get(cardID);
    return id ? this.data.mappings[id] : undefined;
  }

  getMappingsByXiuyuanID(xiuyuanID: string): ICardMapping[] {
    return Object.values(this.data.mappings).filter(m => m.xiuyuanID === xiuyuanID);
  }

  /** 创建 Mapping，返回 mapping ID */
  createMapping(mapping: ICardMapping): string {
    const id = generateID();
    this.data.mappings[id] = mapping;
    this.indexByCardID.set(mapping.cardID, id);
    this.dirty = true;
    return id;
  }

  deleteMapping(id: string): boolean {
    const mapping = this.data.mappings[id];
    if (!mapping) return false;

    this.indexByCardID.delete(mapping.cardID);
    delete this.data.mappings[id];
    this.dirty = true;
    return true;
  }

  // ============ Template CRUD ============

  getTemplate(id: string): ICardTemplate | undefined {
    return this.data.templates[id];
  }

  getAllTemplates(): ICardTemplate[] {
    return Object.values(this.data.templates);
  }

  createTemplate(template: ICardTemplate): void {
    this.data.templates[template.id] = template;
    this.dirty = true;
  }

  updateTemplate(id: string, updates: Partial<ICardTemplate>): boolean {
    const existing = this.data.templates[id];
    if (!existing) return false;

    this.data.templates[id] = { ...existing, ...updates, id };
    this.dirty = true;
    return true;
  }

  deleteTemplate(id: string): boolean {
    if (!this.data.templates[id]) return false;
    delete this.data.templates[id];
    this.dirty = true;
    return true;
  }

  // ============ 统计 ============

  getStats() {
    return {
      xiuyuanCount: Object.keys(this.data.xiuyuans).length,
      mappingCount: Object.keys(this.data.mappings).length,
      templateCount: Object.keys(this.data.templates).length,
    };
  }
}
