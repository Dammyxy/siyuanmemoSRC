/**
 * Xiuyuan (修缘) - 卡片来源抽象层
 *
 * @module XiuyuanTypes
 * @description
 * Xiuyuan 对应 Anki 的 Note 概念，一个 Xiuyuan 可以生成多张 Card。
 * 
 * **核心概念**：
 * - **Xiuyuan (修缘)**: 卡片来源，存储字段映射和模板信息
 * - **CardMapping**: Xiuyuan 到 Card 的映射关系
 * - **CardTemplate**: 卡片模板，定义字段和生成规则
 * 
 * **架构决策**：
 * @see ADR-004: Xiuyuan 卡片来源抽象层 - 设计决策和架构说明
 * @see ../../../docs/adr/ADR-004-xiuyuan-card-source.md
 * 
 * **Xiuyuan 与 FSRSCard 的关系**：
 * ```
 * ┌─────────────────────────────────────────────────────────┐
 * │                    Xiuyuan (卡片来源)                    │
 * │  - 存储字段映射 (fields)                                 │
 * │  - 关联模板 (templateID)                                 │
 * │  - 关联块列表 (blockIDs)                                 │
 * └────────────────────┬────────────────────────────────────┘
 *                      │ 1:N
 *                      ▼
 * ┌─────────────────────────────────────────────────────────┐
 * │                  CardMapping (映射关系)                  │
 * │  - 定义正面字段 (frontFields)                            │
 * │  - 定义反面字段 (backFields)                             │
 * │  - 卡片类型标记 (typeMarker)                             │
 * └────────────────────┬────────────────────────────────────┘
 *                      │ 1:1
 *                      ▼
 * ┌─────────────────────────────────────────────────────────┐
 * │                  FSRSCard (复习卡片)                     │
 * │  - 调度信息 (due, stability, difficulty)                │
 * │  - 复习历史 (reps, lapses, lastReview)                  │
 * │  - 元数据 (meta.xiuyuanID, meta.answerBlockID)          │
 * └─────────────────────────────────────────────────────────┘
 * ```
 * 
 * **数据流示例**：
 * 
 * 1. **创建流程**：
 * ```typescript
 * // 用户选择两个块创建卡片
 * const blockIDs = ['block-question', 'block-answer'];
 * 
 * // 创建 Xiuyuan
 * const xiuyuan: IXiuyuan = {
 *   id: 'xy_123',
 *   blockIDs: ['block-question', 'block-answer'],
 *   fields: [
 *     { name: 'question', blockID: 'block-question' },
 *     { name: 'answer', blockID: 'block-answer' }
 *   ],
 *   templateID: 'basic',
 *   createdAt: Date.now(),
 *   updatedAt: Date.now()
 * };
 * 
 * // 创建 CardMapping
 * const mapping: ICardMapping = {
 *   xiuyuanID: 'xy_123',
 *   cardID: 'block-question', // 使用第一个块作为卡片 ID
 *   frontFields: ['question'],
 *   backFields: ['answer'],
 *   typeMarker: 'basic'
 * };
 * 
 * // 创建 FSRSCard
 * const fsrsCard: FSRSCard = {
 *   id: 'block-question',
 *   blockId: 'block-question',
 *   due: Date.now(),
 *   stability: 0,
 *   difficulty: 0,
 *   // ... 其他 FSRS 字段
 *   meta: {
 *     xiuyuanID: 'xy_123',
 *     answerBlockID: 'block-answer',
 *     templateID: 'basic'
 *   }
 * };
 * ```
 * 
 * 2. **复习流程**：
 * ```typescript
 * // 获取当前复习的卡片
 * const fsrsCard = getCurrentCard();
 * 
 * // 通过 CardMapping 查询 Xiuyuan
 * const mapping = storage.getMappingByCardID(fsrsCard.id);
 * const xiuyuan = storage.getXiuyuan(mapping.xiuyuanID);
 * 
 * // 渲染卡片
 * const frontBlocks = mapping.frontFields.map(
 *   field => xiuyuan.fields.find(f => f.name === field)?.blockID
 * );
 * const backBlocks = mapping.backFields.map(
 *   field => xiuyuan.fields.find(f => f.name === field)?.blockID
 * );
 * 
 * renderCard(frontBlocks, backBlocks);
 * ```
 * 
 * 3. **删除流程**：
 * ```typescript
 * // 删除 Xiuyuan
 * const xiuyuanID = 'xy_123';
 * 
 * // 1. 查询所有关联的 CardMapping
 * const mappings = storage.getMappingsByXiuyuanID(xiuyuanID);
 * 
 * // 2. 删除所有关联的 FSRSCard
 * mappings.forEach(mapping => {
 *   storageManager.removeCard(mapping.cardID);
 * });
 * 
 * // 3. 删除 Xiuyuan（会自动删除 CardMapping）
 * storage.deleteXiuyuan(xiuyuanID);
 * ```
 * 
 * **设计原则**：
 * - **单一职责**：Xiuyuan 负责字段映射，FSRSCard 负责调度
 * - **松耦合**：通过 CardMapping 解耦 Xiuyuan 和 FSRSCard
 * - **可扩展**：支持未来添加更多模板和字段类型
 */

/**
 * 修缘 - 卡片来源
 * 
 * @interface IXiuyuan
 * @description
 * 对应 Anki 的 Note 概念，存储卡片的字段映射和模板信息。
 * 一个 Xiuyuan 可以生成多张 Card（如英-中、中-英、音-中）。
 */
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

/**
 * 字段定义
 * 
 * @interface IXiuyuanField
 * @description
 * 定义 Xiuyuan 的一个字段，包含字段名称、来源块 ID 和角色标记。
 */
export interface IXiuyuanField {
  /** 字段名称（如 'question', 'answer', 'word', 'translation'） */
  name: string;
  /** 字段内容来源块 ID */
  blockID: string;
  /** 字段角色标记（用于模板映射） */
  marker?: string;
}

/**
 * 卡片映射 - Xiuyuan 到 Card 的映射关系
 * 
 * @interface ICardMapping
 * @description
 * 定义 Xiuyuan 如何映射到具体的 FSRSCard。
 * 一个 Xiuyuan 可以有多个 CardMapping（如英-中、中-英）。
 */
export interface ICardMapping {
  /** 修缘 ID */
  xiuyuanID: string;
  /** 卡片 ID（思源 Riff 卡片 ID / blockID） */
  cardID: string;
  /** 正面字段列表（字段名称数组） */
  frontFields: string[];
  /** 反面字段列表（字段名称数组） */
  backFields: string[];
  /** 卡片类型标记（如 'en-zh', 'zh-en', 'basic'） */
  typeMarker?: string;
}

/**
 * 卡片模板
 * 
 * @interface ICardTemplate
 * @description
 * 定义卡片的字段结构和生成规则。
 * 模板决定了如何从 Xiuyuan 生成具体的卡片。
 */
export interface ICardTemplate {
  /** 模板 ID */
  id: string;
  /** 模板名称 */
  name: string;
  /** 模板描述 */
  description?: string;
  /** 字段定义（定义模板需要哪些字段） */
  fields: Array<{ name: string; description?: string }>;
  /** 卡片生成规则（定义如何从字段生成卡片） */
  cardRules: Array<{
    /** 卡片类型标记 */
    typeMarker: string;
    /** 正面使用的字段名称列表 */
    frontFields: string[];
    /** 反面使用的字段名称列表 */
    backFields: string[];
  }>;
}

/**
 * 持久化存储结构
 * 
 * @interface IXiuyuanStore
 * @description
 * Xiuyuan 数据的完整存储结构，包含版本号和所有数据集合。
 */
export interface IXiuyuanStore {
  /** 版本号（用于数据迁移） */
  version: number;
  /** Xiuyuan 集合（key: xiuyuanID, value: IXiuyuan） */
  xiuyuans: Record<string, IXiuyuan>;
  /** CardMapping 集合（key: mappingID, value: ICardMapping） */
  mappings: Record<string, ICardMapping>;
  /** CardTemplate 集合（key: templateID, value: ICardTemplate） */
  templates: Record<string, ICardTemplate>;
}

/**
 * 卡片渲染数据
 * 
 * @interface ICardRenderData
 * @description
 * 复习界面渲染卡片所需的完整数据。
 */
export interface ICardRenderData {
  /** Xiuyuan 对象 */
  xiuyuan: IXiuyuan;
  /** CardMapping 对象 */
  mapping: ICardMapping;
  /** CardTemplate 对象（可能不存在） */
  template: ICardTemplate | undefined;
  /** 正面块 ID 列表 */
  frontBlockIDs: string[];
  /** 反面块 ID 列表 */
  backBlockIDs: string[];
}

/**
 * 存储文件名
 * 
 * @constant
 * @description
 * Xiuyuan 数据存储的 MessagePack 文件名。
 * 完整路径：`storage/petal/{pluginName}/xiuyuan.msgpack`
 * 
 * 🆕 Phase 1.0.5: 迁移到 MessagePack 格式
 * - 性能提升：文件大小减少 40%，加载速度提升 60%
 * - 向后兼容：自动从 JSON 迁移
 */
export const XIUYUAN_STORAGE_KEY = 'xiuyuan.msgpack';

/**
 * 旧版 JSON 存储文件名（用于迁移）
 * 
 * @constant
 * @description
 * 用于从 JSON 格式迁移到 MessagePack 格式。
 */
export const XIUYUAN_STORAGE_KEY_JSON = 'xiuyuan.json';

/**
 * 当前存储版本号
 * 
 * @constant
 * @description
 * 用于数据迁移。当存储格式发生变化时，递增此版本号。
 */
export const XIUYUAN_CURRENT_VERSION = 1;
