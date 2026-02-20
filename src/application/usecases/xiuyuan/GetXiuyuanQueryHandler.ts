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
import { IXiuyuanRepository } from '@/core/xiuyuan/domain/repositories/IXiuyuanRepository';
import { XiuyuanId } from '@/core/xiuyuan/domain/XiuyuanId';

/**
 * 获取单个 Xiuyuan 查询处理器
 * 
 * @class GetXiuyuanQueryHandler
 */
export class GetXiuyuanQueryHandler {
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
   * @param query - 查询对象
   * @returns GetXiuyuanQueryResult - 查询结果
   * @throws Error 如果 Xiuyuan 不存在
   * 
   * @example
   * ```typescript
   * const handler = new GetXiuyuanQueryHandler(xiuyuanRepository);
   * const result = await handler.handle({ xiuyuanId: 'xiuyuan-123' });
   * console.log('Xiuyuan:', result.xiuyuan);
   * ```
   */
  async handle(query: GetXiuyuanQuery): Promise<GetXiuyuanQueryResult> {
    // 1. 创建 XiuyuanId 值对象
    const idResult = XiuyuanId.create(query.xiuyuanId);
    if (!idResult.ok) {
      throw new Error(`Invalid xiuyuanId: ${query.xiuyuanId}`);
    }

    // 2. 从 Repository 查询
    const findResult = await this.xiuyuanRepository.findById(idResult.value);
    if (!findResult.ok) {
      throw findResult.error;
    }

    if (!findResult.value) {
      throw new Error(`Xiuyuan not found: ${query.xiuyuanId}`);
    }

    // 3. 转换为 DTO 返回
    const xiuyuan = findResult.value;
    return {
      xiuyuan: {
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
      }
    };
  }
}
