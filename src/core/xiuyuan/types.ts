/**
 * Xiuyuan (修缘) - 卡片来源抽象层
 *
 * @module XiuyuanTypes
 * @description
 * Xiuyuan 对应 Anki 的 Note 概念，一个 Xiuyuan 可以生成多张 Card。
 * 
 * **核心概念**：
 * - **Xiuyuan (修缘)**: 卡片来源聚合根，存储字段映射和模板信息
 * - **CardFace**: 卡片面，定义问题-答案对
 * - **Card**: 卡片实体，存储调度信息
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
 * │  - 卡片面列表 (faces)                                    │
 * └────────────────────┬────────────────────────────────────┘
 *                      │ 1:N
 *                      ▼
 * ┌─────────────────────────────────────────────────────────┐
 * │                  Card (卡片实体)                         │
 * │  - 调度信息 (scheduleInfo)                               │
 * │  - 面索引 (faceIndex)                                    │
 * └────────────────────┬────────────────────────────────────┘
 *                      │ 1:1
 *                      ▼
 * ┌─────────────────────────────────────────────────────────┐
 * │                  FSRSCard (复习卡片)                     │
 * │  - 调度信息 (due, stability, difficulty)                │
 * │  - 复习历史 (reps, lapses, lastReview)                  │
 * │  - 元数据 (meta.xiuyuanID, meta.faceIndex)              │
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
 * // 创建 Card（通过 Xiuyuan 聚合根）
 * const cardResult = xiuyuan.createCard(0); // faceIndex = 0
 * 
 * // 创建 FSRSCard（通过 Repository）
 * const fsrsCard: FSRSCard = {
 *   id: 'block-question',
 *   blockId: 'block-question',
 *   due: Date.now(),
 *   stability: 0,
 *   difficulty: 0,
 *   // ... 其他 FSRS 字段
 *   meta: {
 *     xiuyuanID: 'xy_123',
 *     faceIndex: 0,
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
 * // 通过 Repository 查询 Xiuyuan
 * const xiuyuan = await repository.findById(fsrsCard.meta.xiuyuanID);
 * 
 * // 获取卡片面
 * const face = xiuyuan.getFaces()[fsrsCard.meta.faceIndex];
 * 
 * // 渲染卡片
 * renderCard(face.questionBlockId, face.answerBlockId);
 * ```
 * 
 * 3. **删除流程**：
 * ```typescript
 * // 删除 Xiuyuan
 * const xiuyuanID = 'xy_123';
 * 
 * // 1. 查询 Xiuyuan
 * const xiuyuan = await repository.findById(xiuyuanID);
 * 
 * // 2. 删除所有关联的 Card（通过 Repository 级联删除）
 * await repository.delete(xiuyuan);
 * ```
 * 
 * **设计原则**：
 * - **单一职责**：Xiuyuan 负责字段映射，Card 负责调度
 * - **聚合根**：Xiuyuan 管理 Card 的生命周期
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

// CardMapping 已移除：Xiuyuan 通过 faces 直接管理卡片映射

/**
 * 模板分类
 * 
 * @type TemplateCategory
 * @description
 * 模板的分类类型，用于在 UI 中分组显示。
 */
export type TemplateCategory = 'basic' | 'cloze' | 'list' | 'concept' | 'quick';

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
  /** 模板分类（用于 UI 分组显示） */
  category?: TemplateCategory;
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
  /** CardTemplate 集合（key: templateID, value: ICardTemplate） */
  templates: Record<string, ICardTemplate>;
}

// ICardRenderData 已移除：直接使用 Xiuyuan 聚合根进行渲染

/**
 * 存储文件名
 * 
 * @constant
 * @description
 * Xiuyuan 数据存储的 MessagePack 文件名。
 * 使用插件的 saveData/loadData API，会自动保存到正确的工作空间目录。
 * 
 * 🆕 Phase 1.0.5: 迁移到 MessagePack 格式
 * - 性能提升：文件大小减少 40%，加载速度提升 60%
 * - 向后兼容：自动从 JSON 迁移
 */
export const XIUYUAN_STORAGE_KEY = 'xiuyuan.msgpack';

/**
 * 当前存储版本号
 * 
 * @constant
 * @description
 * 用于数据迁移。当存储格式发生变化时，递增此版本号。
 * 
 * Version 2 (2026-02-22): 移除 CardMapping 层
 * - 删除 mappings 字段
 * - Xiuyuan 通过 faces 直接管理卡片映射
 */
export const XIUYUAN_CURRENT_VERSION = 2;
