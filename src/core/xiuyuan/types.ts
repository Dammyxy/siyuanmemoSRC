/**
 * Xiuyuan (修缘) - 卡片来源抽象层
 *
 * 对应 Anki 的 Note 概念，一个 Xiuyuan 可以生成多张 Card
 */

/** 修缘 - 卡片来源 */
export interface IXiuyuan {
  /** 唯一标识符 */
  id: string;
  /** 关联的块 ID 列表 */
  blockIDs: string[];
  /** 字段定义 */
  fields: IXiuyuanField[];
  /** 模板 ID */
  templateID: string;
  /** 创建时间戳 */
  createdAt: number;
  /** 更新时间戳 */
  updatedAt: number;
  /** 扩展元数据 */
  meta?: Record<string, unknown>;
}

/** 字段定义 */
export interface IXiuyuanField {
  /** 字段名称 */
  name: string;
  /** 字段内容来源块 ID */
  blockID: string;
  /** 字段角色标记 */
  marker?: string;
}

/** 卡片映射 - Xiuyuan 到 Card 的映射关系 */
export interface ICardMapping {
  /** 修缘 ID */
  xiuyuanID: string;
  /** 卡片 ID（思源 Riff 卡片 ID / blockID） */
  cardID: string;
  /** 正面字段列表 */
  frontFields: string[];
  /** 反面字段列表 */
  backFields: string[];
  /** 卡片类型标记 */
  typeMarker?: string;
}

/** 卡片模板 */
export interface ICardTemplate {
  /** 模板 ID */
  id: string;
  /** 模板名称 */
  name: string;
  /** 模板描述 */
  description?: string;
  /** 字段定义 */
  fields: Array<{ name: string; description?: string }>;
  /** 卡片生成规则 */
  cardRules: Array<{
    typeMarker: string;
    frontFields: string[];
    backFields: string[];
  }>;
}

/** 持久化存储结构 */
export interface IXiuyuanStore {
  version: number;
  xiuyuans: Record<string, IXiuyuan>;
  mappings: Record<string, ICardMapping>;
  templates: Record<string, ICardTemplate>;
}

/** 卡片渲染数据 */
export interface ICardRenderData {
  xiuyuan: IXiuyuan;
  mapping: ICardMapping;
  template: ICardTemplate | undefined;
  frontBlockIDs: string[];
  backBlockIDs: string[];
}

/** 存储常量 */
export const XIUYUAN_STORAGE_KEY = 'xiuyuan.json';
export const XIUYUAN_CURRENT_VERSION = 1;
