/**
 * GetXiuyuanQueryHandler - 获取单个 Xiuyuan 查询处理器
 * 
 * @description
 * 处理获取单个 Xiuyuan 的查询请求。
 * 
 * **设计原则**：
 * - CQRS 模式：查询和命令分离
 * - 查询处理器：专门处理查询请求
 * - 只读操作：不修改数据
 * 
 * **职责**：
 * - 验证查询参数
 * - 从存储中获取 Xiuyuan
 * - 返回查询结果
 * 
 * **业务流程**：
 * 1. 验证 xiuyuanId
 * 2. 从存储中查询 Xiuyuan
 * 3. 如果不存在，抛出错误
 * 4. 返回 Xiuyuan
 */

import { GetXiuyuanQuery, GetXiuyuanQueryResult } from '../../queries/xiuyuan/GetXiuyuanQuery';
import type { XiuyuanService } from '@/core/xiuyuan/service';

/**
 * 获取单个 Xiuyuan 查询处理器
 * 
 * @class GetXiuyuanQueryHandler
 */
export class GetXiuyuanQueryHandler {
  /**
   * 构造函数
   * 
   * @param xiuyuanService - Xiuyuan 领域服务（临时依赖）
   */
  constructor(
    private readonly xiuyuanService: XiuyuanService
  ) {}

  /**
   * 处理查询
   * 
   * @param query - 查询对象
   * @returns GetXiuyuanQueryResult - 查询结果
   * @throws Error 如果 Xiuyuan 不存在
   * 
   * @example
   * ```typescript
   * const handler = new GetXiuyuanQueryHandler(xiuyuanService);
   * const result = await handler.handle({ xiuyuanId: 'xiuyuan-123' });
   * console.log('Xiuyuan:', result.xiuyuan);
   * ```
   */
  async handle(query: GetXiuyuanQuery): Promise<GetXiuyuanQueryResult> {
    const xiuyuan = this.xiuyuanService.getXiuyuan(query.xiuyuanId);
    
    if (!xiuyuan) {
      throw new Error(`Xiuyuan not found: ${query.xiuyuanId}`);
    }
    
    return { xiuyuan };
  }
}
