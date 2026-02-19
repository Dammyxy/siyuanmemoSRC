/**
 * XiuyuanApplicationService - Xiuyuan 应用服务
 * 
 * @description
 * Xiuyuan 相关操作的主要入口点，提供统一的 API。
 * 作为表现层和应用层之间的桥梁。
 * 
 * **设计原则**：
 * - 应用服务模式：协调用例执行
 * - 依赖注入：通过构造函数注入依赖
 * - 薄包装：不包含业务逻辑，仅委托
 * - 统一接口：为表现层提供一致的 API
 * 
 * **职责**：
 * - 提供 Xiuyuan 创建、查询、删除的统一接口
 * - 委托具体业务逻辑给 XiuyuanService（临时方案）
 * - 处理用例之间的协调
 * 
 * **注意**：
 * 当前实现是过渡方案，直接委托给 XiuyuanService。
 * 未来会创建独立的 UseCase 类来实现业务逻辑。
 */

import { Result } from '@/types/result';
import { CreateXiuyuanFromBlocksCommand } from '../commands/xiuyuan/CreateXiuyuanFromBlocksCommand';
import { GetXiuyuanQuery, GetXiuyuanQueryResult } from '../queries/xiuyuan/GetXiuyuanQuery';
import { GetAllXiuyuansQuery, GetAllXiuyuansQueryResult } from '../queries/xiuyuan/GetAllXiuyuansQuery';
import type { XiuyuanService } from '@/core/xiuyuan/service';

/**
 * Xiuyuan 应用服务
 * 
 * @class XiuyuanApplicationService
 */
export class XiuyuanApplicationService {
  /**
   * 构造函数
   * 
   * @param xiuyuanService - Xiuyuan 领域服务（临时依赖，未来会替换为 UseCase）
   */
  constructor(
    private readonly xiuyuanService: XiuyuanService
  ) {}

  /**
   * 从块创建 Xiuyuan
   * 
   * @param command - 创建命令
   * @returns Result<any> - 成功返回创建的 Xiuyuan 和卡片，失败返回错误
   * 
   * @example
   * ```typescript
   * const result = await xiuyuanService.createFromBlocks({
   *   blockIds: ['block-1', 'block-2'],
   *   templateId: 'basic',
   *   fieldMapping: { question: 'block-1', answer: 'block-2' },
   *   deckId: 'deck-123',
   *   priority: 5
   * });
   * 
   * if (result.ok) {
   *   console.log('Created Xiuyuan:', result.value.xiuyuan.id);
   *   console.log('Created Cards:', result.value.cards.length);
   * } else {
   *   console.error('Failed:', result.error);
   * }
   * ```
   */
  async createFromBlocks(command: CreateXiuyuanFromBlocksCommand): Promise<Result<any>> {
    // 临时实现：直接委托给 XiuyuanService
    // TODO: 创建 CreateXiuyuanFromBlocksUseCase
    // 注意：当前 XiuyuanService.createFromBlocks 不支持 priority 参数
    return this.xiuyuanService.createFromBlocks(
      command.blockIds,
      command.templateId,
      command.fieldMapping || {},
      command.deckId
    );
  }

  /**
   * 获取单个 Xiuyuan
   * 
   * @param query - 查询对象
   * @returns GetXiuyuanQueryResult - 查询结果
   * @throws Error 如果 Xiuyuan 不存在
   * 
   * @example
   * ```typescript
   * const result = await xiuyuanService.getXiuyuan({ xiuyuanId: 'xiuyuan-123' });
   * console.log('Xiuyuan:', result.xiuyuan);
   * ```
   */
  async getXiuyuan(query: GetXiuyuanQuery): Promise<GetXiuyuanQueryResult> {
    // 临时实现：直接委托给 XiuyuanService
    // TODO: 创建 GetXiuyuanQueryHandler
    const xiuyuan = this.xiuyuanService.getXiuyuan(query.xiuyuanId);
    
    if (!xiuyuan) {
      throw new Error(`Xiuyuan not found: ${query.xiuyuanId}`);
    }
    
    return { xiuyuan };
  }

  /**
   * 获取所有 Xiuyuan
   * 
   * @param _query - 查询对象（可选，当前未使用）
   * @returns GetAllXiuyuansQueryResult - 查询结果
   * 
   * @example
   * ```typescript
   * const result = await xiuyuanService.getAllXiuyuans({});
   * console.log(`Total: ${result.total}`);
   * result.xiuyuans.forEach(x => console.log(x.id));
   * ```
   */
  async getAllXiuyuans(_query: GetAllXiuyuansQuery = {}): Promise<GetAllXiuyuansQueryResult> {
    // 临时实现：直接委托给 XiuyuanService
    // TODO: 创建 GetAllXiuyuansQueryHandler
    const xiuyuans = this.xiuyuanService.getAllXiuyuans();
    
    return {
      xiuyuans,
      total: xiuyuans.length
    };
  }

  /**
   * 删除 Xiuyuan
   * 
   * @param xiuyuanId - Xiuyuan ID
   * @returns Result<boolean> - 成功返回 true，失败返回错误
   * 
   * @example
   * ```typescript
   * const result = await xiuyuanService.deleteXiuyuan('xiuyuan-123');
   * 
   * if (result.ok) {
   *   console.log('Deleted successfully');
   * } else {
   *   console.error('Failed:', result.error);
   * }
   * ```
   */
  async deleteXiuyuan(xiuyuanId: string): Promise<Result<boolean>> {
    // 临时实现：直接委托给 XiuyuanService
    // TODO: 创建 DeleteXiuyuanUseCase
    return this.xiuyuanService.deleteXiuyuan(xiuyuanId);
  }

  /**
   * 获取模板
   * 
   * @param templateId - 模板 ID
   * @returns 模板对象
   * @throws Error 如果模板不存在
   * 
   * @example
   * ```typescript
   * const template = await xiuyuanService.getTemplate('basic');
   * console.log('Template:', template.name);
   * ```
   */
  async getTemplate(templateId: string): Promise<any> {
    // 临时实现：直接委托给 XiuyuanService
    const template = this.xiuyuanService.getTemplate(templateId);
    
    if (!template) {
      throw new Error(`Template not found: ${templateId}`);
    }
    
    return template;
  }

  /**
   * 获取所有模板
   * 
   * @returns 模板列表
   * 
   * @example
   * ```typescript
   * const templates = await xiuyuanService.getAllTemplates();
   * templates.forEach(t => console.log(t.id, t.name));
   * ```
   */
  async getAllTemplates(): Promise<any[]> {
    // 临时实现：直接委托给 XiuyuanService
    return this.xiuyuanService.getAllTemplates();
  }
}
