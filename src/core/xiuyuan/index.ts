/**
 * Xiuyuan (修缘) - 卡片来源抽象层
 * 
 * @module Xiuyuan
 * @description
 * Xiuyuan 模块提供卡片来源抽象层，对应 Anki 的 Note 概念。
 * 
 * **主要功能**：
 * - 支持多字段卡片（如英-中、中-英、音-中）
 * - 字段映射和模板管理
 * - 与 FSRSCard 的关联管理
 * 
 * **核心类**：
 * - `XiuyuanStorage`: 存储管理器，负责 CRUD 操作
 * - `XiuyuanApplicationService`: 应用服务层，负责业务逻辑（推荐使用）
 * 
 * **使用示例**：
 * ```typescript
 * import { XiuyuanStorage, BUILTIN_TEMPLATES } from '@/core/xiuyuan';
 * import { XiuyuanApplicationService } from '@/application/services/XiuyuanApplicationService';
 * 
 * // 初始化存储
 * const storage = new XiuyuanStorage(plugin);
 * await storage.load();
 * 
 * // 加载内置模板
 * BUILTIN_TEMPLATES.forEach(template => {
 *   storage.createTemplate(template);
 * });
 * 
 * // 使用应用服务（推荐）
 * const xiuyuanAppService = context.getXiuyuanApplicationService();
 * 
 * // 创建卡片
 * const result = await xiuyuanAppService.createFromBlocks({
 *   blockIds: ['block-1', 'block-2'],
 *   templateId: 'basic',
 *   fieldMapping: { question: 'block-1', answer: 'block-2' },
 *   deckId: 'default-deck'
 * });
 * 
 * // 查询
 * const xiuyuan = await xiuyuanAppService.getXiuyuan({ xiuyuanId: result.value.xiuyuan.id });
 * 
 * // 删除
 * await xiuyuanAppService.deleteXiuyuan(result.value.xiuyuan.id);
 * ```
 * 
 * @see {@link XiuyuanStorage} 存储管理器
 * @see {@link XiuyuanApplicationService} 应用服务层（推荐）
 * @see {@link IXiuyuan} Xiuyuan 数据结构
 * @see {@link ICardMapping} 卡片映射数据结构
 * @see {@link ICardTemplate} 卡片模板数据结构
 */

export * from './types';
export { XiuyuanStorage } from './storage';
export { BUILTIN_TEMPLATES } from './templates/builtin';

// ⚠️ XiuyuanService 已移除，请使用 XiuyuanApplicationService
// export { XiuyuanService } from './service';  // ❌ 已废弃并移除

