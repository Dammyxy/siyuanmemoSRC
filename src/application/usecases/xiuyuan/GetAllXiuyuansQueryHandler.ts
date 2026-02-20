/**
 * GetAllXiuyuansQueryHandler - 获取所有 Xiuyuan 查询处理器
 * 
 * @description
 * 处理获取所有 Xiuyuan 的查询请求。
 * 
 * **设计原则**：
 * - CQRS 模式：查询和命令分离
 * - 查询处理器：专门处理查询请求
 * - 只读操作：不修改数据
 * 
 * **职责**：
 * - 从存储中获取所有 Xiuyuan
 * - 返回查询结果（包括总数）
 * 
 * **业务流程**：
 * 1. 从存储中查询所有 Xiuyuan
 * 2. 计算总数
 * 3. 返回结果
 */

import { GetAllXiuyuansQuery, GetAllXiuyuansQueryResult } from '../../queries/xiuyuan/GetAllXiuyuansQuery';
import { IXiuyuanRepository } from '@/core/xiuyuan/domain/repositories/IXiuyuanRepository';

/**
 * 获取所有 Xiuyuan 查询处理器
 * 
 * @class GetAllXiuyuansQueryHandler
 */
export class GetAllXiuyuansQueryHandler {
  /**
   * 构造函数
   * 
   * @param xiuyuanRepository - Xiuyuan 仓储
   */
  constructor(
    private readonly xiuyuanRepository: IXiuyuanRepository
  ) {}

  /**
   * 处理查询
   * 
   * @param _query - 查询对象（可选，当前未使用）
   * @returns GetAllXiuyuansQueryResult - 查询结果
   * 
   * @example
   * ```typescript
   * const handler = new GetAllXiuyuansQueryHandler(xiuyuanRepository);
   * const result = await handler.handle({});
   * console.log(`Total: ${result.total}`);
   * result.xiuyuans.forEach(x => console.log(x.id));
   * ```
   */
  async handle(_query: GetAllXiuyuansQuery = {}): Promise<GetAllXiuyuansQueryResult> {
    // 1. 从 Repository 查询所有 Xiuyuan
    const findResult = await this.xiuyuanRepository.findAll();
    if (!findResult.ok) {
      throw findResult.error;
    }

    // 2. 转换为 DTO
    const xiuyuans = findResult.value.map(xiuyuan => ({
      id: xiuyuan.getId().getValue(),
      blockIDs: xiuyuan.getBlockIDs().map(b => b.getValue()),
      templateID: xiuyuan.getTemplateID().getValue(),
      fields: xiuyuan.getFaces().map((face, index) => ({
        name: `face-${index}`,
        blockID: face.questionBlockId || xiuyuan.getBlockIDs()[0]?.getValue() || '',
        marker: 'question'
      })),
      meta: xiuyuan.getMeta(),
      createdAt: xiuyuan.getCreatedAt().getTime(),
      updatedAt: xiuyuan.getUpdatedAt().getTime()
    }));
    
    return {
      xiuyuans,
      total: xiuyuans.length
    };
  }
}
