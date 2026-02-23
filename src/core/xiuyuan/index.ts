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
 * **核心架构**：
 * - DDD 领域驱动设计
 * - Xiuyuan 聚合根管理 Card 实体
 * - Repository 模式处理持久化
 * - UseCase 模式处理业务逻辑
 * 
 * **使用示例**：
 * ```typescript
 * import { BUILTIN_TEMPLATES } from '@/core/xiuyuan';
 * 
 * // 使用应用服务（推荐）
 * const xiuyuanAppService = context.getXiuyuanApplicationService();
 * 
 * // 创建卡片
 * const result = await xiuyuanAppService.createFromBlocks({
 *   blockIds: ['block-1', 'block-2'],
 *   templateId: 'basic',
 *   deckId: 'default-deck'
 * });
 * 
 * // 查询
 * const xiuyuan = await xiuyuanAppService.getXiuyuan({ 
 *   xiuyuanId: result.value.xiuyuan.id 
 * });
 * 
 * // 删除
 * await xiuyuanAppService.deleteXiuyuan(result.value.xiuyuan.id);
 * ```
 * 
 * **架构层次**：
 * - Application Layer: XiuyuanApplicationService, UseCases
 * - Domain Layer: Xiuyuan (聚合根), Card (实体), IXiuyuanRepository
 * - Infrastructure Layer: XiuyuanRepository, UnifiedStorageManager
 * 
 * @see {@link XiuyuanApplicationService} 应用服务层（推荐）
 * @see {@link IXiuyuan} Xiuyuan 数据结构
 * @see {@link ICardTemplate} 卡片模板数据结构
 */

export * from './types';
export { BUILTIN_TEMPLATES } from './templates/builtin';

// ✅ DDD 架构导出
export * from './domain';
export * from './infrastructure';

