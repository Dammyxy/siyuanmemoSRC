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
 * - `XiuyuanService`: 服务层，负责业务逻辑
 * 
 * **使用示例**：
 * ```typescript
 * import { XiuyuanStorage, XiuyuanService, BUILTIN_TEMPLATES } from '@/core/xiuyuan';
 * 
 * // 初始化
 * const storage = new XiuyuanStorage('siyuan-plugin-fsrs');
 * const service = new XiuyuanService(storage, storageManager);
 * await service.init();
 * 
 * // 加载内置模板
 * BUILTIN_TEMPLATES.forEach(template => {
 *   service.createTemplate(template);
 * });
 * 
 * // 创建卡片
 * const result = await service.createFromBlocks(
 *   ['block-1', 'block-2'],
 *   'basic',
 *   { question: 'block-1', answer: 'block-2' }
 * );
 * 
 * // 查询
 * const xiuyuan = service.getXiuyuan(result.xiuyuan.id);
 * const mapping = service.getMappingByCardID('block-1');
 * 
 * // 删除
 * await service.deleteXiuyuan(result.xiuyuan.id);
 * ```
 * 
 * @see {@link XiuyuanStorage} 存储管理器
 * @see {@link XiuyuanService} 服务层
 * @see {@link IXiuyuan} Xiuyuan 数据结构
 * @see {@link ICardMapping} 卡片映射数据结构
 * @see {@link ICardTemplate} 卡片模板数据结构
 */

export * from './types';
export { XiuyuanStorage } from './storage';
export { XiuyuanService } from './service';
export { BUILTIN_TEMPLATES } from './templates/builtin';
